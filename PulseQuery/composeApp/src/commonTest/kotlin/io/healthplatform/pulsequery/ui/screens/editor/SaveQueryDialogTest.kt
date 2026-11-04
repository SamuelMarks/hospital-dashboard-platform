/**
 * Unit and Compose UI tests for [SaveQueryDialog], [SaveQueryDialogStateHolder], and [SaveQueryDialogUiState].
 */
package io.healthplatform.pulsequery.ui.screens.editor

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.awaitIdle
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.testing.BaseComposeTest
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
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Validates all branches of [SaveQueryDialog], [SaveQueryDialogStateHolder], and helper functions.
 */
@OptIn(ExperimentalTestApi::class)
class SaveQueryDialogTest : BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    private fun createClient(engine: MockEngine): HttpClient = HttpClient(engine) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; isLenient = true })
        }
    }

    @Test
    fun testSaveQueryDialogUiStateAndHelpers() = runBlocking {
        val d1 = DashboardResponse(id = "d-1", name = "ICU Board", ownerId = "u-1")
        val uiState = SaveQueryDialogUiState(
            destination = SaveQueryDestination.TEMPLATE,
            title = "Title",
            category = "Cat",
            description = "Desc",
            visualization = "bar_chart",
            dashboards = listOf(d1),
            selectedDashboardId = "d-1",
            isLoadingDashboards = false,
            isSaving = false,
            error = "Err"
        )
        assertEquals(SaveQueryDestination.TEMPLATE, uiState.destination)
        assertEquals("Title", uiState.title)
        assertEquals("Cat", uiState.category)
        assertEquals("Desc", uiState.description)
        assertEquals("bar_chart", uiState.visualization)
        assertEquals(1, uiState.dashboards.size)
        assertEquals("d-1", uiState.selectedDashboardId)
        assertFalse(uiState.isLoadingDashboards)
        assertFalse(uiState.isSaving)
        assertEquals("Err", uiState.error)

        assertEquals(
            "ICU Board",
            resolveSelectedDashboardLabel(listOf(d1), "d-1", isLoadingDashboards = false)
        )
        assertEquals(
            "Loading dashboards...",
            resolveSelectedDashboardLabel(emptyList(), null, isLoadingDashboards = true)
        )
        assertEquals(
            "Select Target Dashboard",
            resolveSelectedDashboardLabel(emptyList(), null, isLoadingDashboards = false)
        )

        val scope = CoroutineScope(Dispatchers.Unconfined)
        val explicitVm = EditorViewModel(scope = scope)
        val explicitHolder = SaveQueryDialogStateHolder(sql = "SELECT 1", scope = scope, editorViewModel = explicitVm)
        assertSame(explicitHolder, resolveSaveQueryStateHolder("SELECT 1", explicitHolder, scope, null))

        val fromVm = resolveSaveQueryStateHolder("SELECT 1", null, scope, explicitVm)
        assertTrue(fromVm !== explicitHolder)

        val fromDefault = resolveSaveQueryStateHolder("SELECT 1", null, scope, null)
        assertTrue(fromDefault !== fromVm)

        // Default constructor parameter for editorViewModel
        val defaultHolder = SaveQueryDialogStateHolder(sql = "SELECT 1", scope = scope)
        assertEquals(SaveQueryDestination.DASHBOARD_WIDGET, defaultHolder.state.value.destination)
    }

    @Test
    fun testStateHolderValidationLoadAndSaveBranches() = runBlocking {
        val successEngine = createUnconfinedMockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/dashboards") -> respond(
                    content = """[{"id":"d-1","name":"ICU Board","owner_id":"u-1"},{"id":"d-2","name":"ER Board","owner_id":"u-1"}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/widgets") -> respond(
                    content = """{"id":"w-1","dashboard_id":"d-2","title":"Saved Widget","type":"SQL","visualization":"bar_chart","config":{"query":"SELECT 1"}}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/templates") -> respond(
                    content = """{"id":"t-1","title":"Saved Template","sql_template":"SELECT 1","category":"ICU"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        AppContainer.setHttpClientForTest(createClient(successEngine))

        val holder = SaveQueryDialogStateHolder(sql = "SELECT 1", scope = this)

        // Validation: blank title
        var savedMsg: String? = null
        holder.submit(onSaved = { savedMsg = it })
        assertEquals("Title is required", holder.state.value.error)
        assertNull(savedMsg)

        // Validation: non-blank title, DASHBOARD_WIDGET, but selectedDashboardId is null
        holder.updateTitle("My Widget")
        assertNull(holder.state.value.error)
        holder.submit(onSaved = { savedMsg = it })
        assertEquals("Target dashboard is required", holder.state.value.error)

        // Load dashboards
        holder.loadDashboards()
        awaitIdle()
        assertEquals(2, holder.state.value.dashboards.size)
        assertEquals("d-1", holder.state.value.selectedDashboardId)
        assertFalse(holder.state.value.isLoadingDashboards)

        // Select second dashboard and visualization, then submit widget
        holder.selectDashboard("d-2")
        holder.updateVisualization("bar_chart")
        holder.submit(onSaved = { savedMsg = it })
        awaitIdle()
        assertEquals("Widget successfully added to dashboard", savedMsg)
        assertNull(holder.state.value.error)

        // Switch to TEMPLATE destination, update category & description, then submit template
        holder.updateDestination(SaveQueryDestination.TEMPLATE)
        holder.updateCategory("ICU")
        holder.updateDescription("Hourly census")
        holder.submit(onSaved = { savedMsg = it })
        awaitIdle()
        assertEquals("Template successfully registered in library", savedMsg)

        // Empty dashboard list branch (fetched.firstOrNull()?.id == null)
        val emptyDashEngine = createUnconfinedMockEngine {
            respond(
                content = "[]",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        AppContainer.setHttpClientForTest(createClient(emptyDashEngine))
        val emptyHolder = SaveQueryDialogStateHolder(sql = "SELECT 1", scope = this)
        emptyHolder.loadDashboards()
        awaitIdle()
        assertTrue(emptyHolder.state.value.dashboards.isEmpty())
        assertNull(emptyHolder.state.value.selectedDashboardId)

        // Failure paths for loadDashboards and submit
        val failEngine = createUnconfinedMockEngine {
            throw IllegalStateException("Save rejected")
        }
        AppContainer.setHttpClientForTest(createClient(failEngine))
        val failHolder = SaveQueryDialogStateHolder(sql = "SELECT 1", scope = this)
        failHolder.loadDashboards()
        awaitIdle()
        assertFalse(failHolder.state.value.isLoadingDashboards)
        assertNull(failHolder.state.value.selectedDashboardId)

        failHolder.updateDestination(SaveQueryDestination.TEMPLATE)
        failHolder.updateTitle("Failing Template")
        failHolder.submit(onSaved = {})
        awaitIdle()
        assertEquals("Save rejected", failHolder.state.value.error)
        assertFalse(failHolder.state.value.isSaving)
    }

    @Test
    fun testSaveQueryDialogComposeWidgetDropdownsAndSave() = runComposeUiTest {
        val engine = createUnconfinedMockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/dashboards") -> respond(
                    content = """[{"id":"d-1","name":"ICU Operational Board","owner_id":"u-1"},{"id":"d-2","name":"ER Triage Board","owner_id":"u-1"}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/widgets") -> respond(
                    content = """{"id":"w-1","dashboard_id":"d-2","title":"Triage Count","type":"SQL","visualization":"bar_chart","config":{"query":"SELECT 1"}}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        AppContainer.setHttpClientForTest(createClient(engine))

        var savedOutput = ""
        setContent {
            MaterialTheme {
                SaveQueryDialog(
                    sql = "SELECT count(*) FROM triage",
                    onDismiss = {},
                    onSaved = { savedOutput = it }
                )
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("ICU Operational Board").fetchSemanticsNodes().isNotEmpty()
        }

        // Open dashboard dropdown and select ER Triage Board
        onNodeWithContentDescription("Expand dashboard selection menu").performClick()
        onNodeWithText("ER Triage Board").performClick()

        // Open visualization dropdown and select bar_chart
        onNodeWithContentDescription("Expand visualization selection menu").performClick()
        onNodeWithText("bar_chart").performClick()

        // Trigger validation error first when title is empty
        onNodeWithText("Save").performClick()
        onNodeWithText("Title is required").assertIsDisplayed()

        // Enter title and save
        onNodeWithText("Title").performTextInput("Triage Count")
        onNodeWithText("Save").performClick()

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Save", substring = true).fetchSemanticsNodes()
            savedOutput.isNotEmpty()
        }
        assertEquals("Widget successfully added to dashboard", savedOutput)
    }
}
