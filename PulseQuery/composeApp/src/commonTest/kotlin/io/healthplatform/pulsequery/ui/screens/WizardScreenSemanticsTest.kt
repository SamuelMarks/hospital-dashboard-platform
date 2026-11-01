package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.printToLog
import androidx.compose.ui.test.runComposeUiTest
import androidx.compose.ui.test.waitUntilAtLeastOneExists
import io.healthplatform.pulsequery.core.model.ProcessorId
import io.healthplatform.pulsequery.core.model.ProcessorSelectionOption
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.wizard.CustomWidgetConfigurationContent
import io.healthplatform.pulsequery.ui.screens.wizard.ParameterConfigurationContent
import io.healthplatform.pulsequery.ui.screens.wizard.ParameterField
import io.healthplatform.pulsequery.ui.screens.wizard.TemplateSelectionContent
import io.healthplatform.pulsequery.ui.screens.wizard.WizardScreen
import io.healthplatform.pulsequery.ui.screens.wizard.WizardState
import io.healthplatform.pulsequery.ui.screens.wizard.WizardViewModel
import io.healthplatform.pulsequery.ui.screens.wizard.formatWizardVisualizationLabel
import io.healthplatform.pulsequery.ui.screens.wizard.handleWizardNavigationBack
import io.healthplatform.pulsequery.ui.screens.wizard.resolveWizardProcessorDisplayName
import io.healthplatform.pulsequery.ui.screens.wizard.resolveWizardViewModel
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
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
        waitUntilAtLeastOneExists(hasText("Predictive Availability"), timeoutMillis = 15000)
        onNodeWithText("Predictive Availability").assertExists()
        onAllNodesWithText("Availability").onFirst().assertExists()

        // 2. Click template to navigate to parameter configuration
        onNodeWithContentDescription("Template: Predictive Availability").performClick()
        waitForIdle()

        // 3. Verify Parameter Configuration screen appears
        waitUntilAtLeastOneExists(hasText("Widget Title"), timeoutMillis = 15000)
        onNodeWithText("Widget Title").assertExists()
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Create Widget"))
        waitUntilAtLeastOneExists(hasText("Create Widget"), timeoutMillis = 15000)
        onNodeWithText("Create Widget").assertExists().assertHasClickAction()
        onNodeWithText("Back").assertExists().assertHasClickAction()

        // 4. Click Create Widget
        onNodeWithText("Create Widget").performClick()
        waitForIdle()

        // 5. Verify completion callback
        waitUntilAtLeastOneExists(hasText("Widget created successfully!"), timeoutMillis = 15000)
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
        waitUntilAtLeastOneExists(hasText("Predictive Availability"), timeoutMillis = 15000)
        onNodeWithContentDescription("Template: Predictive Availability").performClick()
        waitForIdle()

        waitUntilAtLeastOneExists(hasText("Widget Title"), timeoutMillis = 15000)
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Back"))
        waitUntilAtLeastOneExists(hasText("Back"), timeoutMillis = 15000)

        // Click Back button
        onNodeWithText("Back").performClick()
        waitForIdle()

        // Verify we returned to marketplace
        waitUntilAtLeastOneExists(hasText("Search templates..."), timeoutMillis = 15000)
        onNodeWithText("Predictive Availability").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testWizardScreenFiltersParameterEditsAndCustomWidgetFlow() = runComposeUiTest {
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

        // Category and search filters
        onAllNodesWithText("Availability").onFirst().performClick()
        onNodeWithText("All").performClick()
        onNodeWithContentDescription("Search templates input").performTextInput("Predictive")
        onNodeWithContentDescription("Back").performClick()
        assertTrue(backed)

        // Parameter configuration interactions
        onNodeWithContentDescription("Template: Predictive Availability").performClick()
        waitForIdle()

        onNodeWithText("Widget Title").performTextReplacement("Custom Predictive Title")
        onNodeWithText("Subtitle / Caption").performTextInput("24h ICU Window")
        onNodeWithContentDescription("Allow user natural text input").performClick()
        onNodeWithText("Default Natural Text Prompt").performTextInput("Predict ICU availability")
        onNodeWithContentDescription("Select query processor model or SQL").performClick()
        onAllNodesWithText("SQL [no model]")[1].performClick()
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Bar chart"))
        onNodeWithText("Bar chart").performClick()
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Ward *"))
        onNodeWithText("Ward *").performTextReplacement("PICU")

        // Navigate back via top-bar Back icon
        onNodeWithContentDescription("Back").performClick()
        waitForIdle()

        // Custom SQL widget configuration flow
        onNodeWithText("+ Custom SQL").performClick()
        waitForIdle()
        onNodeWithText("Widget Title").performTextInput("Custom SQL Census")
        onNodeWithText("Subtitle / Caption").performTextInput("Custom Subtitle")
        onNodeWithContentDescription("Allow user natural text input").performClick()
        onNodeWithText("Default Natural Text Prompt").performTextInput("Count patients")
        onNodeWithContentDescription("Select query processor model or SQL").performClick()
        onAllNodesWithText("SQL [no model]")[1].performClick()
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("SQL Query"))
        onNodeWithText("SQL Query").performTextInput("SELECT 1")
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Table"))
        onNodeWithText("Table").performClick()
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Back"))
        onNodeWithText("Back").performClick()
        waitForIdle()

        // Custom TEXT widget configuration flow and Back via top-bar
        onNodeWithText("+ Note / Text").performClick()
        waitForIdle()
        onNodeWithContentDescription("Back").performClick()
        waitForIdle()

        // Custom HTTP widget configuration flow and submit
        onNodeWithText("+ Custom HTTP").performClick()
        waitForIdle()
        onNodeWithText("Widget Title").performTextInput("HTTP Endpoint Widget")
        onNodeWithText("POST").performClick()
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Endpoint URL", substring = true))
        onNodeWithText("Endpoint URL", substring = true).performTextInput("https://api.hospital.local/metrics")
        onAllNodes(hasScrollAction()).onFirst().performScrollToNode(hasText("Create Widget"))
        onNodeWithText("Create Widget").performClick()
        waitForIdle()
        assertTrue(completed)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testWizardErrorRetry() = runComposeUiTest {
        val failEngine = MockEngine {
            respond("Error", HttpStatusCode.InternalServerError)
        }
        AppContainer.setHttpClientForTest(HttpClient(failEngine))
        val vm = WizardViewModel(dashboardId = "dash-1", scope = CoroutineScope(Dispatchers.Unconfined))

        setContent {
            MaterialTheme {
                WizardScreen(dashboardId = "dash-1", viewModel = vm)
            }
        }
        waitForIdle()
        onNodeWithText("Retry").performClick()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testWizardStandaloneContentDefaultCallbacks() = runComposeUiTest {
        setContent {
            MaterialTheme {
                val dummyVm = WizardViewModel(dashboardId = "d-1", scope = CoroutineScope(Dispatchers.Unconfined))
                androidx.compose.foundation.layout.Column {
                    io.healthplatform.pulsequery.ui.screens.wizard.WizardStateBody(
                        state = WizardState.Loading,
                        paddingValues = androidx.compose.foundation.layout.PaddingValues(),
                        vm = dummyVm,
                        onComplete = {}
                    )
                    io.healthplatform.pulsequery.ui.screens.wizard.WizardStateBody(
                        state = WizardState.Submitting(),
                        paddingValues = androidx.compose.foundation.layout.PaddingValues(),
                        vm = dummyVm,
                        onComplete = {}
                    )
                    io.healthplatform.pulsequery.ui.screens.wizard.WizardStateBody(
                        state = WizardState.Success(
                            widget = io.healthplatform.pulsequery.api.models.WidgetResponse(
                                id = "w-1",
                                dashboardId = "d-1",
                                title = "T1",
                                type = "SQL",
                                visualization = "table",
                                config = kotlinx.serialization.json.JsonObject(emptyMap())
                            )
                        ),
                        paddingValues = androidx.compose.foundation.layout.PaddingValues(),
                        vm = dummyVm,
                        onComplete = {}
                    )
                    TemplateSelectionContent(
                        state = WizardState.TemplateSelection(
                            templates = emptyList(),
                            categories = emptyList(),
                            selectedCategory = null,
                            searchQuery = ""
                        ),
                        onCategorySelected = {},
                        onSearchChanged = {},
                        onTemplateSelected = {}
                    )
                    ParameterConfigurationContent(
                        state = WizardState.ParameterConfiguration(
                            template = io.healthplatform.pulsequery.api.models.TemplateResponse(
                                id = "t1",
                                title = "T1",
                                category = "Cat",
                                sqlTemplate = "SELECT 1"
                            ),
                            widgetTitle = "",
                            visualization = "table",
                            parameterFields = listOf(
                                ParameterField(key = "k1", title = "OptParam", type = "string", defaultValue = "", isRequired = false)
                            ),
                            parameterValues = mapOf("k1" to ""),
                            fieldErrors = mapOf("title" to "Required", "k1" to "Invalid")
                        ),
                        onTitleChanged = {},
                        onVisualizationChanged = {},
                        onParameterChanged = { _, _ -> },
                        onSubmit = {},
                        onBack = {}
                    )
                    CustomWidgetConfigurationContent(
                        state = WizardState.CustomWidgetConfiguration(
                            creationType = "TEXT",
                            widgetTitle = "",
                            queryOrUrlOrContent = "",
                            fieldErrors = mapOf("title" to "Title err", "content" to "Content err")
                        ),
                        onTitleChanged = {},
                        onContentChanged = {},
                        onVisualizationChanged = {},
                        onHttpMethodChanged = {},
                        onSubmit = {},
                        onBack = {}
                    )
                }
            }
        }
        waitForIdle()
    }

    @Test
    fun testWizardScreenPureHelpers() {
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val provided = WizardViewModel(dashboardId = "d-1", scope = scope)
        assertSame(provided, resolveWizardViewModel("d-1", provided, scope))
        val created = resolveWizardViewModel("d-1", null, scope)
        assertTrue(created !== provided)

        var backToTemplatesCount = 0
        var exitCount = 0
        handleWizardNavigationBack(
            state = WizardState.Loading,
            onBackToTemplates = { backToTemplatesCount++ },
            onBack = { exitCount++ }
        )
        assertEquals(0, backToTemplatesCount)
        assertEquals(1, exitCount)

        handleWizardNavigationBack(
            state = WizardState.CustomWidgetConfiguration(creationType = "SQL"),
            onBackToTemplates = { backToTemplatesCount++ },
            onBack = { exitCount++ }
        )
        assertEquals(1, backToTemplatesCount)

        handleWizardNavigationBack(
            state = WizardState.ParameterConfiguration(
                template = io.healthplatform.pulsequery.api.models.TemplateResponse(
                    id = "t1",
                    title = "T1",
                    category = "Cat",
                    sqlTemplate = "SELECT 1"
                ),
                widgetTitle = "T1",
                visualization = "table",
                parameterFields = emptyList(),
                parameterValues = emptyMap()
            ),
            onBackToTemplates = { backToTemplatesCount++ },
            onBack = { exitCount++ }
        )
        assertEquals(2, backToTemplatesCount)

        val options = listOf(ProcessorSelectionOption.SQL_DEFAULT)
        assertEquals("SQL [no model]", resolveWizardProcessorDisplayName(options, ProcessorId.SQL_NO_MODEL))
        assertEquals("custom-llm", resolveWizardProcessorDisplayName(options, ProcessorId("custom-llm")))

        assertEquals("Bar chart", formatWizardVisualizationLabel("bar_chart"))
        assertEquals("", formatWizardVisualizationLabel(""))
    }
}
