/**
 * Compose UI tests for [DashboardScreen] widget grid rendering, edit mode, and dialogs.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import androidx.compose.ui.test.waitUntilAtLeastOneExists
import io.healthplatform.pulsequery.api.models.DataHealthSchema
import io.healthplatform.pulsequery.api.models.DuckDbHealthSchema
import io.healthplatform.pulsequery.api.models.LlmHealthSchema
import io.healthplatform.pulsequery.api.models.PostgresHealthSchema
import io.healthplatform.pulsequery.api.models.SystemHealthResponse
import io.healthplatform.pulsequery.api.models.TemplateHealthSchema
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardViewModel
import io.healthplatform.pulsequery.ui.screens.dashboard.WidgetRenderState
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
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
import kotlin.test.assertNull
import kotlin.test.assertSame
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
        val mockEngine = createUnconfinedMockEngine { request ->
            when {
                request.url.encodedPath.contains("system/health") -> {
                    respond(
                        """{"overall_status":"healthy","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.endsWith("/refresh") -> {
                    if (successLoad) {
                        respond(
                            """{
                                "w-1":{"data":[{"label":"ICU","value":15}]},
                                "w-2":{"data":[{"label":"ER","value":22}]},
                                "w-3":{"data":[{"label":"Ward","value":40}]},
                                "w-4":{"data":[{"label":"Occupancy","value":85}]},
                                "w-5":{"data":[{"label":"MedSurg","value":30}]}
                            }""",
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond("Server error", HttpStatusCode.InternalServerError)
                    }
                }
                request.url.encodedPath.contains("dashboards") -> {
                    val path = request.url.encodedPath
                    when {
                        !successLoad -> respond("Server error", HttpStatusCode.InternalServerError)
                        path.contains("/export/pdf") -> respond(
                            content = "%PDF-1.4",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Pdf.toString())
                        )
                        path.contains("/export") -> respond(
                            content = "col1,col2\n1,2",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Text.CSV.toString())
                        )
                        path.contains("/shares") -> respond(
                            content = "[]",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                        path.contains("/widgets/") && request.method == HttpMethod.Put -> respond(
                            content = """{"id":"w-1","dashboard_id":"dash-1","title":"Census Bar","type":"SQL","visualization":"bar_chart","config":{"query":"SELECT 1"}}""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                        path.contains("/widgets") && request.method == HttpMethod.Post -> respond(
                            content = """{"id":"w-new","dashboard_id":"dash-1","title":"Staged","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                        request.method == HttpMethod.Delete -> respond("", HttpStatusCode.NoContent)
                        request.method == HttpMethod.Post -> respond(
                            content = """{"id":"dash-2","name":"Created Dashboard","owner_id":"u-1","widgets":[]}""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                        successLoad -> respond(
                            dashboardsJson,
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                        else -> respond("Server error", HttpStatusCode.InternalServerError)
                    }
                }
                request.url.encodedPath.contains("/execution/sql") -> respond(
                    content = """{"data":[{"label":"ICU","value":15}]}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                request.url.encodedPath.contains("/ai/models") -> respond(
                    content = "[]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
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
        onNodeWithTag("dashboard_grid").performScrollToNode(hasText("Line Widget"))
        onNodeWithText("Line Widget").assertExists()
        onNodeWithTag("dashboard_grid").performScrollToNode(hasText("Pie Widget"))
        onNodeWithText("Pie Widget").assertExists()
        onNodeWithTag("dashboard_grid").performScrollToNode(hasText("Metric Widget"))
        onNodeWithText("Metric Widget").assertExists()
        onNodeWithTag("dashboard_grid").performScrollToNode(hasText("Table Widget"))
        onNodeWithText("Table Widget").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testWidgetElevatedCardNaturalTextExecutionAndEditDialog() = runComposeUiTest {
        val nlWidget = io.healthplatform.pulsequery.api.models.WidgetResponse(
            id = "w-nl",
            dashboardId = "dash-1",
            title = "Interactive NL Widget",
            subtitle = "Inpatient census query caption",
            type = "SQL",
            visualization = "table",
            config = kotlinx.serialization.json.buildJsonObject {
                put("query", kotlinx.serialization.json.JsonPrimitive("SELECT 1"))
                put("allow_natural_text", kotlinx.serialization.json.JsonPrimitive(true))
                put("processor", kotlinx.serialization.json.JsonPrimitive("ollama:llama3"))
                put("natural_text_prompt", kotlinx.serialization.json.JsonPrimitive("Count patients"))
            }
        )
        var executedPrompt: String? = null
        setContent {
            MaterialTheme {
                androidx.compose.foundation.layout.Column {
                    WidgetElevatedCard(
                        widget = nlWidget,
                        renderState = io.healthplatform.pulsequery.ui.screens.dashboard.WidgetRenderState(
                            allowNaturalText = true,
                            processor = io.healthplatform.pulsequery.core.model.ProcessorId("ollama:llama3"),
                            naturalTextPrompt = "Count patients",
                            generatedSql = "SELECT COUNT(*) FROM patients"
                        ),
                        onExecuteNaturalText = { executedPrompt = it }
                    )
                    WidgetElevatedCard(
                        widget = nlWidget.copy(
                            id = "w-nl-busy",
                            title = "Busy NL Widget",
                            subtitle = null,
                            config = kotlinx.serialization.json.buildJsonObject {
                                put("allow_natural_text", kotlinx.serialization.json.JsonPrimitive(true))
                            }
                        ),
                        renderState = io.healthplatform.pulsequery.ui.screens.dashboard.WidgetRenderState(
                            allowNaturalText = true,
                            isExecutingNaturalText = true,
                            naturalTextPrompt = "Busy",
                            generatedSql = "SELECT 1"
                        )
                    )
                }
            }
        }
        waitForIdle()
        onNodeWithText("Interactive NL Widget").assertExists()
        onNodeWithText("Inpatient census query caption").assertExists()
        onNodeWithTag("widget_subtitle_w-nl").assertExists()
        onNodeWithText("ollama:llama3").assertExists()
        onNodeWithTag("widget_natural_text_run_w-nl").performClick()
        runOnIdle {
            assertEquals("Count patients", executedPrompt)
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAddWidgetPromptCardInteractions() = runComposeUiTest {
        var clickCount = 0
        setContent {
            MaterialTheme {
                AddWidgetPromptCard(onAddWidget = { clickCount++ })
            }
        }
        waitForIdle()
        onNodeWithTag("add_widget_cta_card").assertExists()
        onNodeWithTag("cta_browse_templates_btn").performClick()
        onNodeWithTag("cta_custom_sql_btn").performClick()
        runOnIdle {
            assertEquals(2, clickCount)
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardTopBarDialogsReorderingEditingAndExportActions() = runComposeUiTest {
        val twoWidgetJson = """
            [
              {
                "id": "dash-1",
                "name": "Main Dashboard",
                "owner_id": "u-1",
                "widgets": [
                  {"id":"w-1","dashboard_id":"dash-1","title":"Census Bar","type":"SQL","visualization":"bar_chart","config":{"query":"SELECT 1","allow_natural_text":true,"natural_text_prompt":"Init"}},
                  {"id":"w-2","dashboard_id":"dash-1","title":"ER Line","type":"SQL","visualization":"line_chart","config":{"query":"SELECT 2"}}
                ]
              }
            ]
        """.trimIndent()
        setupMockApi(successLoad = true, dashboardsJson = twoWidgetJson)
        AppContainer.queryCartRepository.addQuery("Staged Q", "SELECT 1")

        val vm = DashboardViewModel(scope = CoroutineScope(Dispatchers.Unconfined))
        var addedDashId: String? = null

        setContent {
            MaterialTheme {
                DashboardScreen(
                    onAddWidget = { addedDashId = it },
                    viewModel = vm
                )
            }
        }
        waitForIdle()

        // Dashboard selector dropdown: select dashboard and open Create New Dashboard dialog
        onNodeWithContentDescription("Select Dashboard").performClick()
        onAllNodesWithText("Main Dashboard")[1].performClick()

        onNodeWithContentDescription("Select Dashboard").performClick()
        onNodeWithText("Create New Dashboard...").performClick()
        onNodeWithText("Dashboard Name").performTextInput("Pediatric Ops")
        onNodeWithText("Create").performClick()
        waitForIdle()

        // Reopen Create Dashboard dialog via menu and Cancel
        onNodeWithContentDescription("Select Dashboard").performClick()
        onNodeWithText("Create New Dashboard...").performClick()
        onNodeWithText("Cancel").performClick()
        waitForIdle()

        // Switch back to Main Dashboard which has 2 widgets
        onNodeWithContentDescription("Select Dashboard").performClick()
        onAllNodesWithText("Main Dashboard")[1].performClick()
        waitForIdle()

        // FilterRibbon interactions
        onNodeWithText("Department: All").performClick()
        onNodeWithText("Cardiology").performClick()
        onNodeWithContentDescription("Clear Filters").performClick()

        // Widget natural text input and execution inside DashboardScreen
        onNodeWithTag("widget_natural_text_input_w-1").performTextInput(" Updated")
        onNodeWithTag("widget_natural_text_run_w-1").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)

        // Move down on first widget, move up on second widget
        onAllNodesWithContentDescription("Move Down").onFirst().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        onNodeWithTag("dashboard_grid").performScrollToNode(hasText("ER Line"))
        onAllNodesWithContentDescription("Move Up").onLast().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)

        // Edit widget dialog: open, save, reopen, cancel
        onAllNodesWithContentDescription("Edit Widget").onFirst().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        onNodeWithText("Save Changes").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        waitForIdle()

        onAllNodesWithContentDescription("Edit Widget").onFirst().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        onNodeWithText("Cancel").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        waitForIdle()

        // Delete widget, then Undo & Redo
        onAllNodesWithContentDescription("Delete Widget").onFirst().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        waitForIdle()
        onNodeWithContentDescription("Undo").performClick()
        waitForIdle()
        onNodeWithContentDescription("Redo").performClick()
        waitForIdle()

        // Query Cart bottom sheet: open and deploy (which triggers both onQueriesDeployed and onDismiss)
        onNodeWithContentDescription("Query Cart").performClick()
        onNodeWithText("Add 1 Widgets to Dashboard").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        waitForIdle()

        // Share dialog: open and dismiss
        onNodeWithContentDescription("Share Dashboard").performClick()
        onAllNodesWithText("Done").onFirst().performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        waitForIdle()

        // Export menu: PDF, CSV, JSON
        onNodeWithContentDescription("Export Dashboard").performClick()
        onNodeWithText("Clinical PDF Report").performClick()
        waitForIdle()

        onNodeWithContentDescription("Export Dashboard").performClick()
        onNodeWithText("CSV Data Snapshot").performClick()
        waitForIdle()

        onNodeWithContentDescription("Export Dashboard").performClick()
        onNodeWithText("JSON Layout Snapshot").performClick()
        waitForIdle()

        // Delete dashboard
        onNodeWithContentDescription("Delete Dashboard").performClick()
        waitForIdle()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardEmptyDashboardsState() = runComposeUiTest {
        setupMockApi(successLoad = true, dashboardsJson = "[]")
        val emptyVm = DashboardViewModel(scope = CoroutineScope(Dispatchers.Unconfined))
        setContent {
            MaterialTheme {
                DashboardScreen(viewModel = emptyVm)
            }
        }
        waitForIdle()
        onNodeWithText("Create Dashboard").performClick()
        onNodeWithText("Cancel").performClick()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardEmptyWidgetsState() = runComposeUiTest {
        val zeroWidgetsJson = """[{"id":"d-empty","name":"Empty Dash","owner_id":"u-1","widgets":[]}]"""
        setupMockApi(successLoad = true, dashboardsJson = zeroWidgetsJson)
        val zeroWidgetsVm = DashboardViewModel(scope = CoroutineScope(Dispatchers.Unconfined))
        var ctaClickedId: String? = null
        setContent {
            MaterialTheme {
                DashboardScreen(
                    onAddWidget = { ctaClickedId = it },
                    viewModel = zeroWidgetsVm
                )
            }
        }
        waitForIdle()
        onNodeWithTag("cta_browse_templates_btn").performClick()
        assertEquals("d-empty", ctaClickedId)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardSingleWidgetTrailingCtaState() = runComposeUiTest {
        val oneWidgetJson = """[{"id":"d-one","name":"One Dash","owner_id":"u-1","widgets":[{"id":"w-1","dashboard_id":"d-one","title":"Only Widget","type":"SQL","visualization":"bar_chart","config":{"query":"SELECT 1"}}]}]"""
        setupMockApi(successLoad = true, dashboardsJson = oneWidgetJson)
        val oneWidgetVm = DashboardViewModel(scope = CoroutineScope(Dispatchers.Unconfined))
        var ctaClickedId: String? = null
        setContent {
            MaterialTheme {
                DashboardScreen(
                    onAddWidget = { ctaClickedId = it },
                    viewModel = oneWidgetVm
                )
            }
        }
        waitForIdle()
        onNodeWithTag("dashboard_grid").performScrollToNode(hasContentDescription("Add Another Widget to Your Dashboard"))
        onNodeWithTag("cta_browse_templates_btn").performClick()
        assertEquals("d-one", ctaClickedId)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardUnhealthyDatabaseRetryState() = runComposeUiTest {
        val degradedEngine = createUnconfinedMockEngine { request ->
            if (request.url.encodedPath.contains("health")) {
                respond(
                    content = """{"overall_status":"degraded","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"error","error":"PG Down"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":false,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":0,"has_templates":false,"missing_file":false},"llm":{"providers_count":0,"mock_mode":false,"models":[]},"warnings":[]}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else {
                respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
            }
        }
        AppContainer.setHttpClientForTest(
            HttpClient(degradedEngine) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }
        )
        kotlinx.coroutines.runBlocking {
            AppContainer.networkHealthRepository.checkHealth()
        }
        val dbErrVm = DashboardViewModel(scope = CoroutineScope(Dispatchers.Unconfined))
        setContent {
            MaterialTheme {
                DashboardScreen(viewModel = dbErrVm)
            }
        }
        waitForIdle()
        onNodeWithText("Retry Query").performClick()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardLoadErrorRetryAndWidgetCardDefaultCallbacks() = runComposeUiTest {
        setupMockApi(successLoad = false)
        val loadErrVm = DashboardViewModel(scope = CoroutineScope(Dispatchers.Unconfined))
        val defaultWidget = io.healthplatform.pulsequery.api.models.WidgetResponse(
            id = "w-def",
            dashboardId = "d-1",
            title = "Default Callbacks Card",
            type = "SQL",
            visualization = "markdown",
            config = kotlinx.serialization.json.buildJsonObject {
                put("query", kotlinx.serialization.json.JsonPrimitive("SELECT 1"))
            }
        )
        setContent {
            MaterialTheme {
                androidx.compose.foundation.layout.Column {
                    DashboardScreen(viewModel = loadErrVm)
                    DashboardTopBarActions(
                        activeDashboard = io.healthplatform.pulsequery.api.models.DashboardResponse(
                            id = "d-1",
                            name = "Collab Dash",
                            ownerId = "u-1"
                        ),
                        collaborators = listOf(
                            io.healthplatform.pulsequery.network.CollaboratorPresence(
                                userId = "u-2",
                                email = "alice@hospital.org"
                            )
                        ),
                        canUndo = false,
                        canRedo = false,
                        cartItemCount = 0,
                        showExportMenu = false,
                        onOpenExportMenu = {},
                        onCloseExportMenu = {},
                        onUndo = {},
                        onRedo = {},
                        onOpenCart = {},
                        onOpenShare = {},
                        onExportFormat = { _, _, _ -> },
                        onDeleteDashboard = {}
                    )
                    WidgetElevatedCard(
                        widget = defaultWidget,
                        renderState = WidgetRenderState(data = listOf("A" to 1f)),
                        canMoveUp = true,
                        canMoveDown = true
                    )
                    WidgetContent(widget = defaultWidget)
                }
            }
        }
        waitForIdle()
        onNodeWithText("Retry").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        onNodeWithContentDescription("Move Up").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        onNodeWithContentDescription("Move Down").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        onNodeWithContentDescription("Edit Widget").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
        onNodeWithContentDescription("Delete Widget").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.OnClick)
    }

    @Test
    fun testDashboardScreenPureHelpers() = kotlinx.coroutines.runBlocking {
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val provided = DashboardViewModel(scope = scope)
        assertSame(provided, resolveDashboardViewModel(provided, scope))
        val created = resolveDashboardViewModel(null, scope)
        assertTrue(created !== provided)

        assertEquals("Default DB", resolveDashboardDatabaseErrorMessage(null, "Default DB"))
        val duckErr = SystemHealthResponse(
            overallStatus = "degraded",
            timestamp = "2026-09-14T12:00:00Z",
            postgres = PostgresHealthSchema(status = "connected", error = null),
            duckdb = DuckDbHealthSchema(status = "error", path = "mem", error = "DuckDB Err"),
            data = DataHealthSchema(hasDefaultData = false, fallbackGenerated = false),
            templates = TemplateHealthSchema(templatesLoaded = 0, hasTemplates = false, missingFile = false),
            llm = LlmHealthSchema(providersCount = 0, mockMode = false)
        )
        assertEquals("DuckDB Err", resolveDashboardDatabaseErrorMessage(duckErr, "Default DB"))
        val pgErr = duckErr.copy(
            duckdb = DuckDbHealthSchema(status = "ready", path = "mem", error = null),
            postgres = PostgresHealthSchema(status = "error", error = "PG Err")
        )
        assertEquals("PG Err", resolveDashboardDatabaseErrorMessage(pgErr, "Default DB"))
        val clean = pgErr.copy(postgres = PostgresHealthSchema(status = "connected", error = null))
        assertEquals("Default DB", resolveDashboardDatabaseErrorMessage(clean, "Default DB"))

        var invokedWith: String? = null
        invokeAddWidgetCallback(null, "d-1")
        assertNull(invokedWith)
        invokeAddWidgetCallback({ invokedWith = it }, "d-1")
        assertEquals("d-1", invokedWith)

        submitCreateDashboardIfValid("   ", provided, "Err")
        assertEquals("FromRender", resolveWidgetNaturalTextInitialPrompt("FromRender", "FromConfig"))
        assertEquals("FromConfig", resolveWidgetNaturalTextInitialPrompt("", "FromConfig"))

        val customRenderState = WidgetRenderState(textContent = "Custom")
        assertSame(customRenderState, resolveWidgetRenderState(mapOf("w1" to customRenderState), "w1"))
        assertEquals(WidgetRenderState(), resolveWidgetRenderState(emptyMap(), "w-missing"))

        assertEquals("A: 1.0; B: 2.5", formatMarkdownPairsContent(listOf("A" to 1.0f, "B" to 2.5f)))

        // Test performDashboardExportAction branches
        setupMockApi(successLoad = true)
        val pdfSuccess = performDashboardExportAction(
            dashboardId = "dash-1",
            format = "pdf",
            fallbackErrorMsg = "PDF Fallback",
            deviceSaver = { _, _, _ -> Result.success("/tmp/report.pdf") }
        )
        assertTrue(pdfSuccess.startsWith("Report saved to"))

        val pdfLocalFallback = performDashboardExportAction(
            dashboardId = "dash-1",
            format = "pdf",
            fallbackErrorMsg = "PDF Fallback",
            deviceSaver = { _, _, _ -> Result.failure(RuntimeException("Disk full")) }
        )
        assertTrue(pdfLocalFallback.startsWith("Report exported locally:"))

        val csvSuccess = performDashboardExportAction(
            dashboardId = "dash-1",
            format = "csv",
            fallbackErrorMsg = "CSV Fallback",
            deviceSaver = { _, _, _ -> Result.success("/tmp/report.csv") }
        )
        assertTrue(csvSuccess.startsWith("CSV saved to"))

        val csvLocalFallback = performDashboardExportAction(
            dashboardId = "dash-1",
            format = "csv",
            fallbackErrorMsg = "CSV Fallback",
            deviceSaver = { _, _, _ -> Result.failure(RuntimeException("Disk full")) }
        )
        assertTrue(csvLocalFallback.startsWith("CSV exported locally:"))

        setupMockApi(successLoad = false)
        val failMsg = performDashboardExportAction(
            dashboardId = "dash-1",
            format = "json",
            fallbackErrorMsg = "JSON Fallback"
        )
        assertTrue(failMsg.isNotBlank())

        assertEquals("Custom Err", resolveExportErrorMessage("Custom Err", "Fallback"))
        assertEquals("Fallback", resolveExportErrorMessage(null, "Fallback"))
    }
}
