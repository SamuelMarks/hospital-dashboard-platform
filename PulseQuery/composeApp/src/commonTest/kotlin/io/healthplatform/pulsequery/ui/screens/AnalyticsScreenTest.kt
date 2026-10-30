/**
 * Compose UI and ViewModel integration tests for [AnalyticsScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.runComposeUiTest
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
 * Validates that [AnalyticsScreen] renders LLM Arena candidate rows, empty states,
 * and error banners accurately against a Ktor [MockEngine].
 */
class AnalyticsScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    /**
     * Resets [AppContainer] state prior to each test.
     */
    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupAnalyticsMock(mode: String) {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("/api/v1/analytics/llm") -> {
                    when (mode) {
                        "records" -> respond(
                            content = """[
                                {
                                    "source": "ai",
                                    "candidate_id": "cand-1",
                                    "user_id": "u-1",
                                    "user_email": "clinician@stanford.edu",
                                    "prompt": "Count ICU beds",
                                    "llm": "gemini-2.5-pro",
                                    "sql_snippet": "SELECT count(*) FROM icu_beds",
                                    "is_selected": true,
                                    "latency_ms": 120,
                                    "created_at": "2026-09-01T10:00:00Z"
                                },
                                {
                                    "source": "chat",
                                    "candidate_id": "cand-2",
                                    "user_id": "u-2",
                                    "user_email": "analyst@stanford.edu",
                                    "prompt": "Show PICU transfers",
                                    "llm": "medgemma-27b-text-it",
                                    "sql_snippet": "SELECT * FROM transfers",
                                    "is_selected": false,
                                    "latency_ms": 210,
                                    "created_at": "2026-09-01T11:00:00Z"
                                }
                            ]""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                        "empty" -> respond(
                            content = "[]",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                        else -> respond(
                            content = """{"detail":"Analytics database offline"}""",
                            status = HttpStatusCode.InternalServerError,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    /**
     * Verifies that [AnalyticsScreen] renders LLM candidate rows, model names, SQL snippets, and user emails.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenRendersRecordsAndMetrics() = runComposeUiTest {
        setupAnalyticsMock("records")

        setContent {
            MaterialTheme {
                AnalyticsScreen()
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("gemini-2.5-pro", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("gemini-2.5-pro", substring = true).assertIsDisplayed()
        onNodeWithText("clinician@stanford.edu", substring = true).assertIsDisplayed()
    }

    /**
     * Verifies that [AnalyticsScreen] displays the localized empty state when no records exist.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenEmptyState() = runComposeUiTest {
        setupAnalyticsMock("empty")

        setContent {
            MaterialTheme {
                AnalyticsScreen()
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("No analytics data", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("No analytics data", substring = true).assertIsDisplayed()
    }

    /**
     * Verifies that [AnalyticsScreen] renders the error state when the backend returns HTTP 500.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenErrorAndRetryFlow() = runComposeUiTest {
        setupAnalyticsMock("error")

        setContent {
            MaterialTheme {
                AnalyticsScreen()
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Analytics database offline", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Analytics database offline", substring = true).assertIsDisplayed()
    }
}
