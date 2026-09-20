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
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Compose UI tests for [DashboardScreen] covering initial load, error states,
 * widget creation navigation, and dynamic visualization matchers.
 */
class DashboardScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(
        successLoad: Boolean = true,
        dashboardsJson: String = """[{"id":"dash-1","name":"Main Dashboard","owner_id":"u-1","widgets":[{"id":"w-1","dashboard_id":"dash-1","title":"Census Bar","type":"SQL","visualization":"bar_chart","config":{"query":"SELECT 1"}}]}]"""
    ) {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("system/health") -> {
                    respond(
                        """{"overall_status":"healthy","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("dashboards") -> {
                    if (successLoad) {
                        respond(
                            dashboardsJson,
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond("Server error", HttpStatusCode.InternalServerError)
                    }
                }
                request.url.encodedPath.contains("execution") -> {
                    respond(
                        """{"widget_id":"w-1","data":[{"ward":"ICU","count":15}],"cached":false,"execution_time_ms":12.0}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
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

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardScreenInitial() = runComposeUiTest {
        setupMockApi(successLoad = true)

        setContent {
            MaterialTheme {
                DashboardScreen()
            }
        }

        waitUntilAtLeastOneExists(hasContentDescription("Add Widget"), timeoutMillis = 10000)
        waitUntilAtLeastOneExists(hasText("Main Dashboard"), timeoutMillis = 10000)
        onNodeWithText("Main Dashboard").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardScreenLoadError() = runComposeUiTest {
        setupMockApi(successLoad = false)

        setContent {
            MaterialTheme {
                DashboardScreen()
            }
        }

        waitUntilAtLeastOneExists(hasText("Retry"), timeoutMillis = 15000)
        onNodeWithText("Retry").assertExists().assertHasClickAction()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardAddWidgetNavigation() = runComposeUiTest {
        setupMockApi(successLoad = true)

        var passedDashboardId: String? = null
        setContent {
            MaterialTheme {
                DashboardScreen(
                    onAddWidget = { passedDashboardId = it }
                )
            }
        }

        waitUntilAtLeastOneExists(hasContentDescription("Add Widget"), timeoutMillis = 15000)
        onNodeWithContentDescription("Add Widget").assertExists().performClick()

        runOnIdle {
            assertEquals("dash-1", passedDashboardId)
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardDynamicVisualizationsRendering() = runComposeUiTest {
        val multiWidgetJson = """
            [
              {
                "id": "dash-1",
                "name":"Main Dashboard",
                "owner_id":"u-1",
                "widgets":[
                  {"id":"w-1","dashboard_id":"dash-1","title":"Bar Widget","type":"SQL","visualization":"bar_chart","config":{"query":"SELECT 1"}},
                  {"id":"w-2","dashboard_id":"dash-1","title":"Line Widget","type":"SQL","visualization":"line_chart","config":{"query":"SELECT 1"}},
                  {"id":"w-3","dashboard_id":"dash-1","title":"Pie Widget","type":"SQL","visualization":"pie","config":{"query":"SELECT 1"}},
                  {"id":"w-4","dashboard_id":"dash-1","title":"Metric Widget","type":"SQL","visualization":"metric","config":{"query":"SELECT 1"}},
                  {"id":"w-5","dashboard_id":"dash-1","title":"Table Widget","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}
                ]
              }
            ]
        """.trimIndent()

        setupMockApi(successLoad = true, dashboardsJson = multiWidgetJson)

        setContent {
            MaterialTheme {
                DashboardScreen()
            }
        }

        waitUntilAtLeastOneExists(hasText("Bar Widget"), timeoutMillis = 15000)
        onNodeWithText("Bar Widget").assertExists()
        onAllNodes(hasScrollAction()).onLast().performScrollToNode(hasText("Line Widget"))
        onNodeWithText("Line Widget").assertExists()
        onAllNodes(hasScrollAction()).onLast().performScrollToNode(hasText("Pie Widget"))
        onNodeWithText("Pie Widget").assertExists()
        onAllNodes(hasScrollAction()).onLast().performScrollToNode(hasText("Metric Widget"))
        onNodeWithText("Metric Widget").assertExists()
        onAllNodes(hasScrollAction()).onLast().performScrollToNode(hasText("Table Widget"))
        onNodeWithText("Table Widget").assertExists()
    }
}
