/**
 * Unit tests for the MpaxArenaScreen component.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.api.models.MpaxArenaCandidate
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test

/**
 * Compose UI tests verifying prompt submission, model evaluation, and voting in MpaxArenaScreen.
 */
class MpaxArenaScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @kotlin.test.AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    /**
     * Sets up mock HTTP engine for MPAX arena execution endpoint.
     *
     * @param shouldSucceed Whether API calls should succeed.
     */
    private fun setupMockApi(shouldSucceed: Boolean = true) {
        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath
            if (path.contains("system/health")) {
                respond(
                    """{"overall_status":"healthy","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                    HttpStatusCode.OK,
                    headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else if (!shouldSucceed) {
                respond("Simulation Error", HttpStatusCode.InternalServerError)
            } else {
                val body = """{
                    "experiment_id": "exp-101",
                    "mode": "critic",
                    "candidates": [
                        {
                            "id": "c1",
                            "model_name": "Claude-3.5-Sonnet",
                            "content": "Reallocate 5 Stepdown beds to ICU to handle the surge.",
                            "mpax_score": 92,
                            "sql_snippet": "UPDATE bed_allocations SET unit='ICU' WHERE id IN (1,2,3,4,5);",
                            "is_selected": false
                        }
                    ],
                    "ground_truth_mpax": null
                }"""
                respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
            }
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testMpaxArenaExecutionAndVoting() = runComposeUiTest {
        setupMockApi(shouldSucceed = true)

        val candidate = MpaxArenaCandidate(
            id = "c1",
            modelName = "Claude-3.5-Sonnet",
            content = "Reallocate 5 Stepdown beds to ICU to handle the surge.",
            mpaxScore = 92,
            sqlSnippet = "UPDATE bed_allocations SET unit='ICU' WHERE id IN (1,2,3,4,5);",
            isSelected = false
        )

        setContent {
            MaterialTheme {
                MpaxArenaScreen(
                    initialState = MpaxArenaUiState(
                        prompt = "Optimize bed capacity.",
                        experimentId = "exp-101",
                        candidates = listOf(candidate)
                    )
                )
            }
        }

        onNodeWithText("Critic").assertIsDisplayed()
        onNodeWithText("Claude-3.5-Sonnet").assertExists()
        onNodeWithText("Score: 92/100").assertExists()

        // Vote for first candidate
        onAllNodesWithText("Vote as Best")[0].performScrollTo().performClick()

        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("Selected Winner").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Selected Winner").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testMpaxArenaErrorState() = runComposeUiTest {
        setupMockApi(shouldSucceed = false)

        setContent {
            MaterialTheme {
                MpaxArenaScreen()
            }
        }

        onNodeWithText("Run Arena Competition").performClick()

        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("Retry").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Retry").assertExists()
    }
}
