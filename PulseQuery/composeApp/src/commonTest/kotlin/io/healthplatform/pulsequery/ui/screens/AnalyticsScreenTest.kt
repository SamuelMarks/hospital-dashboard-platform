/**
 * Compose UI and ViewModel integration tests for [AnalyticsScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.models.SystemHealthResponse
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
import kotlin.test.assertEquals

/**
 * Validates that [AnalyticsScreen] renders LLM Arena candidate rows, empty states,
 * helper functions, and error banners accurately against a Ktor [MockEngine].
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
                request.url.encodedPath.contains("/system/health") -> {
                    if (mode == "db_unhealthy") {
                        respond(
                            content = """{"overall_status":"degraded","timestamp":"2026-09-01T00:00:00Z","postgres":{"status":"error","error":"PG down"},"duckdb":{"status":"error","error":"DuckDB locked","total_tables":0,"tables":{}},"data":{"has_default_data":false,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":0,"has_templates":false,"missing_file":false},"llm":{"providers_count":0,"mock_mode":true,"models":[]},"warnings":[]}""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond(
                            content = """{"overall_status":"healthy","timestamp":"2026-09-01T00:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
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
                                    "query_text": "Count ICU beds",
                                    "llm": "gemini-2.5-pro",
                                    "sql_snippet": "SELECT count(*) FROM icu_beds",
                                    "sql_hash": "hash1",
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
                                    "query_text": null,
                                    "llm": "medgemma-27b-text-it",
                                    "sql_snippet": "SELECT * FROM transfers",
                                    "sql_hash": "hash2",
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

    @Test
    fun testAnalyticsPureHelpers() {
        assertEquals("SELECT 1", resolveAnalyticsQueryText("SELECT 1", "N/A"))
        assertEquals("N/A", resolveAnalyticsQueryText(null, "N/A"))

        assertEquals("Fallback DB Error", resolveAnalyticsDatabaseErrorMessage(null, "Fallback DB Error"))

        val jsonParser = Json { ignoreUnknownKeys = true }
        val baseHealth = jsonParser.decodeFromString<SystemHealthResponse>(
            """{"overall_status":"degraded","timestamp":"2026-09-01T00:00:00Z","postgres":{"status":"error","error":"PG down"},"duckdb":{"status":"error","error":"DuckDB locked","total_tables":0,"tables":{}},"data":{"has_default_data":false,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":0,"has_templates":false,"missing_file":false},"llm":{"providers_count":0,"mock_mode":true,"models":[]},"warnings":[]}"""
        )
        assertEquals("DuckDB locked", resolveAnalyticsDatabaseErrorMessage(baseHealth, "Default"))

        val pgOnlyError = baseHealth.copy(duckdb = baseHealth.duckdb.copy(error = null))
        assertEquals("PG down", resolveAnalyticsDatabaseErrorMessage(pgOnlyError, "Default"))

        val noSpecificError = pgOnlyError.copy(postgres = baseHealth.postgres.copy(error = null))
        assertEquals("Default", resolveAnalyticsDatabaseErrorMessage(noSpecificError, "Default"))

        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val existingVm = io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsViewModel(scope = scope)
        setupAnalyticsMock("records")
        retryDatabaseAndLoadAnalytics(existingVm, "Fallback")
        AppContainer.resetForTest()
    }

    /**
     * Verifies that [AnalyticsScreen] renders LLM candidate rows, model names, SQL snippets, user emails, and action buttons.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenRendersRecordsAndMetrics() = runComposeUiTest {
        setupAnalyticsMock("records")
        var alertNavCount = 0
        val vm = io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsViewModel(
            scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        )

        setContent {
            MaterialTheme {
                AnalyticsScreen(
                    onNavigateToAlertRules = { alertNavCount++ },
                    viewModel = vm
                )
            }
        }

        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("gemini-2.5-pro", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("gemini-2.5-pro", substring = true).assertIsDisplayed()
        onNodeWithText("clinician@stanford.edu", substring = true).assertIsDisplayed()

        // Click top bar Alert Rules, Refresh, and banner Configure
        onNodeWithText("Alert Rules").performClick()
        onNodeWithText("Configure").performClick()
        onNodeWithContentDescription("Refresh").performClick()
        assertEquals(2, alertNavCount)
    }

    /**
     * Verifies that [AnalyticsScreen] displays the localized empty state when no records exist.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenEmptyState() = runComposeUiTest {
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        val mockEngine = MockEngine { request ->
            if (request.url.encodedPath.contains("/api/v1/analytics/llm")) {
                gate.await()
                respond(
                    content = "[]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else {
                respond(
                    content = """{"overall_status":"healthy","timestamp":"2026-09-01T00:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        AppContainer.setHttpClientForTest(
            HttpClient(mockEngine) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true; isLenient = true })
                }
            }
        )

        setContent {
            MaterialTheme {
                AnalyticsScreen()
            }
        }

        waitForIdle()
        gate.complete(Unit)

        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("No analytics data", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("No analytics data", substring = true).assertIsDisplayed()
    }

    /**
     * Verifies that [AnalyticsScreen] renders the error state when the backend returns HTTP 500 and handles retry.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenErrorAndRetryFlow() = runComposeUiTest {
        setupAnalyticsMock("error")
        val vm = io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsViewModel(
            scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        )

        setContent {
            MaterialTheme {
                AnalyticsScreen(viewModel = vm)
            }
        }

        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("Retry", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Retry", substring = true).assertIsDisplayed().performClick()
    }

    /**
     * Verifies that [AnalyticsScreen] displays [DatabaseErrorCard] when database health is degraded and retries on click.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenDatabaseUnhealthyAndRetry() = runComposeUiTest {
        setupAnalyticsMock("db_unhealthy")
        kotlinx.coroutines.runBlocking {
            AppContainer.networkHealthRepository.checkHealth()
        }
        val vm = io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsViewModel(
            scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        )

        setContent {
            MaterialTheme {
                AnalyticsScreen(viewModel = vm)
            }
        }

        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("Retry Query", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Retry Query", substring = true).assertIsDisplayed().performClick()
        AppContainer.resetForTest()
    }
}
