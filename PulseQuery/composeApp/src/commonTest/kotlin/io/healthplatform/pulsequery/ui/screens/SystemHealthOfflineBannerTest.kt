package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.App
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
 * Compose UI tests verifying [BackendOfflineBanner] and [DatabaseErrorCard]
 * display and retry behaviors across application screens.
 */
class SystemHealthOfflineBannerTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    private val healthySystemResponse = """
        {
          "overall_status": "healthy",
          "timestamp": "2026-09-14T12:00:00Z",
          "postgres": { "status": "connected" },
          "duckdb": { "status": "ready", "total_tables": 1, "tables": {} },
          "data": { "has_default_data": true, "fallback_generated": false, "missing_files": [], "row_counts": {} },
          "templates": { "templates_loaded": 1, "has_templates": true, "missing_file": false },
          "llm": { "providers_count": 1, "mock_mode": false, "models": [] },
          "warnings": []
        }
    """.trimIndent()

    private val degradedDatabaseResponse = """
        {
          "overall_status": "critical",
          "timestamp": "2026-09-14T12:00:00Z",
          "postgres": { "status": "error", "error": "Postgres unavailable" },
          "duckdb": { "status": "error", "error": "DuckDB lock error" },
          "data": { "has_default_data": false, "fallback_generated": false, "missing_files": [], "row_counts": {} },
          "templates": { "templates_loaded": 0, "has_templates": false, "missing_file": true },
          "llm": { "providers_count": 0, "mock_mode": true, "models": [] },
          "warnings": []
        }
    """.trimIndent()

    private var mockSystemStatus = HttpStatusCode.OK
    private var mockSystemJson = healthySystemResponse

    private fun setupMockEngine() {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("system/health") -> {
                    if (mockSystemStatus == HttpStatusCode.OK) {
                        respond(
                            mockSystemJson,
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond("Service Unavailable", HttpStatusCode.ServiceUnavailable)
                    }
                }
                request.url.encodedPath.contains("dashboards") -> {
                    respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
                }
                request.url.encodedPath.contains("analytics") -> {
                    respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
        mockSystemStatus = HttpStatusCode.OK
        mockSystemJson = healthySystemResponse
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testBackendOfflineBannerAppearsWhenServerUnreachable() = runComposeUiTest {
        mockSystemStatus = HttpStatusCode.ServiceUnavailable
        setupMockEngine()

        AppContainer.networkHealthRepository.refreshHealth()

        setContent {
            App()
        }

        // Offline banner should appear with Offline indicator
        waitUntilAtLeastOneExists(hasText("Backend Inaccessible"), timeoutMillis = 5000)
        onNodeWithText("Backend Inaccessible").assertExists()
        onNodeWithContentDescription("Offline indicator").assertExists()
        onNodeWithContentDescription("Retry").assertExists().assertHasClickAction()

        // Recover the server and retry
        mockSystemStatus = HttpStatusCode.OK
        mockSystemJson = healthySystemResponse
        onNodeWithContentDescription("Retry").performClick()

        // Banner should dismiss upon recovery
        waitUntilDoesNotExist(hasText("Backend Inaccessible"), timeoutMillis = 5000)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDatabaseErrorCardAppearsInDashboardWhenDegraded() = runComposeUiTest {
        mockSystemStatus = HttpStatusCode.OK
        mockSystemJson = degradedDatabaseResponse
        setupMockEngine()

        AppContainer.networkHealthRepository.refreshHealth()

        setContent {
            MaterialTheme {
                DashboardScreen()
            }
        }

        waitUntilAtLeastOneExists(hasText("Database Misconfiguration"), timeoutMillis = 5000)
        onNodeWithText("Database Misconfiguration").assertExists()
        onNodeWithText("Retry Query").assertExists().assertHasClickAction()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDatabaseErrorCardAppearsInSimulationWhenDegraded() = runComposeUiTest {
        mockSystemStatus = HttpStatusCode.OK
        mockSystemJson = degradedDatabaseResponse
        setupMockEngine()

        AppContainer.networkHealthRepository.refreshHealth()

        setContent {
            MaterialTheme {
                SimulationScreen()
            }
        }

        waitUntilAtLeastOneExists(hasText("Database Misconfiguration"), timeoutMillis = 5000)
        onNodeWithText("Database Misconfiguration").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDatabaseErrorCardAppearsInAnalyticsWhenDegraded() = runComposeUiTest {
        mockSystemStatus = HttpStatusCode.OK
        mockSystemJson = degradedDatabaseResponse
        setupMockEngine()

        AppContainer.networkHealthRepository.refreshHealth()

        setContent {
            MaterialTheme {
                AnalyticsScreen()
            }
        }

        waitUntilAtLeastOneExists(hasText("Database Misconfiguration"), timeoutMillis = 5000)
        onNodeWithText("Database Misconfiguration").assertExists()
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }
}
