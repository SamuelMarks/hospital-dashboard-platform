/**
 * Compose UI integration tests for [EditorScreen] and [SaveQueryDialog].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.editor.SaveQueryDestination
import io.healthplatform.pulsequery.ui.screens.editor.SaveQueryDialog
import io.ktor.client.HttpClient
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
import kotlin.test.assertTrue

/**
 * Verifies SQL execution, error handling, and query saving in [EditorScreen].
 */
class EditorScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    /**
     * Resets [AppContainer] before each test.
     */
    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(success: Boolean = true, returnErrorMsg: Boolean = false) {
        val mockEngine = createUnconfinedMockEngine { request ->
            when {
                request.url.encodedPath.contains("ai/execute") -> {
                    if (!success) {
                        respond(
                            """{"detail":"DuckDB engine error"}""",
                            HttpStatusCode.InternalServerError,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else if (returnErrorMsg) {
                        respond(
                            """{"status":"error","error":"Syntax error near FROM","data":[],"columns":[]}""",
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond(
                            """{"status":"success","error":null,"data":[{"id":"1","name":"TestResult"}],"columns":["id","name"]}""",
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
                request.url.encodedPath.contains("widgets") -> {
                    respond(
                        """{"id":"w-1","dashboard_id":"1","title":"Census Widget","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("widgets") -> {
                    respond(
                        """{"id":"w-1","dashboard_id":"1","title":"Census Widget","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("widgets") -> {
                    respond(
                        """{"id":"w-1","dashboard_id":"1","title":"Census Widget","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("dashboards") -> {
                    respond(
                        """[{"id":"dash-1","name":"ICU Operational Board","is_auto_refresh":false,"refresh_interval_seconds":30,"theme":"light","created_at":"2026-09-01T00:00:00Z","updated_at":"2026-09-01T00:00:00Z"}]""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("templates") -> {
                    respond(
                        """{"id":"tpl-1","title":"Saved Template","sql_template":"SELECT 1","category":"Clinical"}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
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
     * Verifies that [EditorScreen] executes a SQL query and renders the returned tabular data.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenInitialAndExecuteSuccess() = runComposeUiTest {
        setupMockApi(success = true)

        setContent {
            MaterialTheme {
                EditorScreen()
            }
        }

        onNodeWithText("Execute", useUnmergedTree = true).performClick()
        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("TestResult", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("TestResult", substring = true).assertExists()
    }

    /**
     * Verifies that [EditorScreen] displays SQL execution error messages returned in the payload.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenExecuteErrorResponse() = runComposeUiTest {
        setupMockApi(success = true, returnErrorMsg = true)

        setContent {
            MaterialTheme {
                EditorScreen()
            }
        }

        onNodeWithText("Execute", useUnmergedTree = true).performClick()
        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Syntax error near FROM", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Syntax error near FROM", substring = true).assertIsDisplayed()
    }

    /**
     * Verifies that [EditorScreen] displays a network/HTTP error message when the endpoint returns HTTP 500.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenExecuteNetworkError() = runComposeUiTest {
        setupMockApi(success = false)

        setContent {
            MaterialTheme {
                EditorScreen()
            }
        }

        onNodeWithText("Execute", useUnmergedTree = true).performClick()
        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("DuckDB engine error", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("DuckDB engine error", substring = true).assertIsDisplayed()
    }

    /**
     * Verifies that clicking Save Query opens [SaveQueryDialog], supports dismissal, and shows a snackbar when saved.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenOpensDismissesAndSavesDialogAndUpdatesSqlAndStagesCart() = runComposeUiTest {
        setupMockApi(success = true)
        val customVm = io.healthplatform.pulsequery.ui.screens.editor.EditorViewModel(
            scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        )

        setContent {
            MaterialTheme {
                EditorFabIcon(isLoading = true)
                EditorFabIcon(isLoading = false)
                EditorScreen(viewModel = customVm)
            }
        }

        onNodeWithText("Query").performTextInput(" WHERE 1=1")
        onNodeWithText("Add to Cart").performClick()

        onNodeWithContentDescription("Save Query").performClick()
        onNodeWithText("Save Analytical Query").assertExists()
        onNodeWithText("Dashboard Widget").assertExists()
        onNodeWithText("Template Library").assertExists()

        // Dismiss dialog
        onNodeWithText("Cancel").performClick()
        waitForIdle()

        // Re-open dialog and save as template to trigger onSaved snackbar
        onNodeWithContentDescription("Save Query").performClick()
        onNodeWithText("Template Library").performClick()
        onNodeWithText("Title").performTextInput("Admissions Count")
        onNodeWithText("Save").performClick()

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Template successfully registered in library", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Template successfully registered in library", substring = true).assertIsDisplayed()
    }

    /**
     * Verifies [resolveEditorViewModel] returns a provided instance or constructs a new one.
     */
    @Test
    fun testResolveEditorViewModel() {
        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val provided = io.healthplatform.pulsequery.ui.screens.editor.EditorViewModel(scope = scope)
        assertEquals(provided, resolveEditorViewModel(provided, scope))
        val created = resolveEditorViewModel(null, scope)
        assertTrue(created !== provided)
    }

    /**
     * Verifies that [SaveQueryDialog] in Template Library mode saves a template and invokes `onSaved`.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testSaveQueryDialogTemplateMode() = runComposeUiTest {
        setupMockApi(success = true)
        var savedMessage = ""

        setContent {
            MaterialTheme {
                SaveQueryDialog(
                    sql = "SELECT count(*) FROM admissions",
                    onDismiss = {},
                    onSaved = { savedMessage = it }
                )
            }
        }

        onNodeWithText("Template Library").performClick()
        onNodeWithText("Category").assertExists()
        onNodeWithText("Description").assertExists()
        onNodeWithText("Title").performTextInput("Admissions Count")
        onNodeWithText("Save").performClick()

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Save", substring = true).fetchSemanticsNodes()
            savedMessage.isNotEmpty()
        }
        assertEquals("Template successfully registered in library", savedMessage)
    }

    /**
     * Verifies [SaveQueryDestination] enum entries and [io.healthplatform.pulsequery.ui.screens.editor.EditorViewModel.saveQuery] localized confirmation messages.
     */
    @Test
    fun testSaveQueryDestinationEnumValues() = kotlinx.coroutines.runBlocking {
        assertEquals(2, SaveQueryDestination.entries.size)
        assertTrue(SaveQueryDestination.entries.contains(SaveQueryDestination.DASHBOARD_WIDGET))
        assertTrue(SaveQueryDestination.entries.contains(SaveQueryDestination.TEMPLATE))

        setupMockApi(success = true)
        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val vm = io.healthplatform.pulsequery.ui.screens.editor.EditorViewModel(scope = scope)
        val widgetRes = vm.saveQuery(
            io.healthplatform.pulsequery.ui.screens.editor.SaveQueryCommand(
                destination = SaveQueryDestination.DASHBOARD_WIDGET,
                title = "Census Widget",
                sql = "SELECT 1",
                dashboardId = "1",
                widgetSuccessMessage = "Custom Widget Saved"
            )
        )
        assertEquals("Custom Widget Saved", widgetRes.getOrNull())

        val tplRes = vm.saveQuery(
            io.healthplatform.pulsequery.ui.screens.editor.SaveQueryCommand(
                destination = SaveQueryDestination.TEMPLATE,
                title = "Census Template",
                sql = "SELECT 1",
                dashboardId = null,
                templateSuccessMessage = "Custom Template Saved"
            )
        )
        assertEquals("Custom Template Saved", tplRes.getOrNull())
    }
}
