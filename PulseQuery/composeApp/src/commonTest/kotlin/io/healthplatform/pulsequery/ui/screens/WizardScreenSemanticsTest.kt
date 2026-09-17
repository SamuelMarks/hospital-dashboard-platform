package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.wizard.WizardScreen
import io.healthplatform.pulsequery.ui.screens.wizard.WizardViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
import kotlin.test.assertTrue

/**
 * Semantics and Compose UI tests for [WizardScreen] verifying template marketplace rendering,
 * parameter configuration form, and widget creation workflow.
 */
class WizardScreenSemanticsTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    private val sampleTemplates = """
        [
          {
            "id": "tpl-1",
            "title": "Predictive Availability",
            "description": "Calculate bed availability",
            "category": "Availability",
            "sql_template": "SELECT '{{ward}}';",
            "parameters_schema": {
              "type": "object",
              "properties": {
                "ward": {
                  "type": "string",
                  "default": "ICU",
                  "title": "Ward"
                }
              },
              "required": ["ward"]
            }
          }
        ]
    """.trimIndent()

    private val sampleWidgetResponse = """
        {
          "id": "wid-123",
          "dashboard_id": "dash-1",
          "title": "Predictive Availability",
          "type": "SQL",
          "visualization": "bar_chart",
          "config": { "query": "SELECT 'ICU';" }
        }
    """.trimIndent()

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("system/health") -> {
                    respond(
                        content = """{"overall_status":"healthy","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("templates") -> {
                    respond(
                        content = sampleTemplates,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("widgets") -> {
                    respond(
                        content = sampleWidgetResponse,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
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
    fun testWizardScreenFlowFromMarketplaceToCreation() = runComposeUiTest {
        var completed = false
        var backed = false
        val vm = WizardViewModel(dashboardId = "dash-1", scope = CoroutineScope(Dispatchers.Unconfined))

        setContent {
            MaterialTheme {
                WizardScreen(
                    dashboardId = "dash-1",
                    viewModel = vm,
                    onComplete = { completed = true },
                    onBack = { backed = true }
                )
            }
        }
        waitForIdle()
        onRoot().printToLog("WIZARD_TREE")

        // 1. Verify Template Marketplace renders
        waitUntilAtLeastOneExists(hasText("Predictive Availability"), timeoutMillis = 5000)
        onNodeWithText("Predictive Availability").assertExists()
        onAllNodesWithText("Availability").onFirst().assertExists()

        // 2. Click template to navigate to parameter configuration
        onNodeWithContentDescription("Template: Predictive Availability").performClick()
        waitForIdle()

        // 3. Verify Parameter Configuration screen appears
        waitUntilAtLeastOneExists(hasText("Widget Title"), timeoutMillis = 5000)
        onNodeWithText("Widget Title").assertExists()
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Create Widget"))
        waitUntilAtLeastOneExists(hasText("Create Widget"), timeoutMillis = 5000)
        onNodeWithText("Create Widget").assertExists().assertHasClickAction()
        onNodeWithText("Back").assertExists().assertHasClickAction()

        // 4. Click Create Widget
        onNodeWithText("Create Widget").performClick()
        waitForIdle()

        // 5. Verify completion callback
        waitUntilAtLeastOneExists(hasText("Widget created successfully!"), timeoutMillis = 5000)
        assertTrue(completed)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testWizardScreenBackFromConfiguration() = runComposeUiTest {
        val vm = WizardViewModel(dashboardId = "dash-1", scope = CoroutineScope(Dispatchers.Unconfined))
        setContent {
            MaterialTheme {
                WizardScreen(
                    dashboardId = "dash-1",
                    viewModel = vm
                )
            }
        }
        waitForIdle()

        // Navigate into configuration
        waitUntilAtLeastOneExists(hasText("Predictive Availability"), timeoutMillis = 5000)
        onNodeWithContentDescription("Template: Predictive Availability").performClick()
        waitForIdle()

        waitUntilAtLeastOneExists(hasText("Widget Title"), timeoutMillis = 5000)
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Back"))
        waitUntilAtLeastOneExists(hasText("Back"), timeoutMillis = 5000)

        // Click Back button
        onNodeWithText("Back").performClick()
        waitForIdle()

        // Verify we returned to marketplace
        waitUntilAtLeastOneExists(hasText("Search templates..."), timeoutMillis = 5000)
        onNodeWithText("Predictive Availability").assertExists()
    }
}
