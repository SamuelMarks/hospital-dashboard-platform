/**
 * Unit tests for the BenchmarksScreen component.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
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
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test

/**
 * Compose UI tests verifying the display, tab switching, and error handling of BenchmarksScreen.
 */
class BenchmarksScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    /**
     * Sets up mock HTTP engine for benchmarks endpoints.
     *
     * @param shouldSucceed Whether API calls should return valid data.
     * @param isEmpty Whether benchmarks lists should be empty.
     */
    private fun setupMockApi(shouldSucceed: Boolean = true, isEmpty: Boolean = false) {
        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath.removeSuffix("/")
            if (path.contains("system/health")) {
                respond(
                    """{"overall_status":"healthy","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                    HttpStatusCode.OK,
                    headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else if (!shouldSucceed) {
                respond("Internal Server Error", HttpStatusCode.InternalServerError)
            } else if (path.endsWith("/benchmarks/sql")) {
                val body = if (isEmpty) "[]" else """[
                    {
                        "theme": "ICU Census",
                        "sql": "SELECT COUNT(*) FROM icu_admissions",
                        "difficulty": "Hard",
                        "description": "Calculate daily census of ICU admissions."
                    }
                ]"""
                respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
            } else if (path.endsWith("/benchmarks/mpax")) {
                val body = if (isEmpty) "[]" else """[
                    {
                        "title": "Surge Response",
                        "difficulty": "Complex",
                        "description": "Reallocate overflow beds to stepdown units.",
                        "target_service": "Critical Care"
                    }
                ]"""
                respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
            } else {
                respond("Not Found", HttpStatusCode.NotFound)
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
    fun testBenchmarksScreenSuccessAndTabSwitch() = runComposeUiTest {
        val sqlItem = SqlBenchmarkItem(
            theme = "ICU Census",
            sql = "SELECT COUNT(*) FROM icu_admissions",
            difficulty = "Hard",
            description = "Calculate daily census of ICU admissions."
        )
        val mpaxItem = MpaxBenchmarkItem(
            title = "Surge Response",
            difficulty = "Complex",
            description = "Reallocate overflow beds to stepdown units.",
            targetService = "Critical Care"
        )

        setContent {
            MaterialTheme {
                BenchmarksScreen(
                    initialState = BenchmarksUiState(
                        isLoading = false,
                        sqlBenchmarks = listOf(sqlItem),
                        mpaxBenchmarks = listOf(mpaxItem)
                    )
                )
            }
        }

        onNodeWithText("ICU Census").assertIsDisplayed()
        onNodeWithText("Hard").assertIsDisplayed()

        // Switch to MPAX Scenarios Tab
        onNodeWithTag("tab-mpax").performClick()

        onNodeWithText("Surge Response").assertIsDisplayed()
        onNodeWithText("Service: Critical Care").assertIsDisplayed()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testBenchmarksScreenEmptyState() = runComposeUiTest {
        setContent {
            MaterialTheme {
                BenchmarksScreen(
                    initialState = BenchmarksUiState(
                        isLoading = false,
                        sqlBenchmarks = emptyList(),
                        mpaxBenchmarks = emptyList()
                    )
                )
            }
        }

        onNodeWithText("No SQL benchmarks available.").assertIsDisplayed()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testBenchmarksScreenErrorState() = runComposeUiTest {
        setupMockApi(shouldSucceed = false)

        setContent {
            MaterialTheme {
                BenchmarksScreen()
            }
        }

        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("Retry").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Retry").assertIsDisplayed()
    }
}
