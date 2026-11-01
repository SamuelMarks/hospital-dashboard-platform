/**
 * Unit and Compose UI tests for [EditWidgetDialog] and its pure helper functions.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.models.ModelInfo
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.core.model.ProcessorId
import io.healthplatform.pulsequery.core.model.ProcessorSelectionOption
import io.healthplatform.pulsequery.core.model.TypedWidgetConfig
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Validates [EditWidgetDialog] helper functions, payload construction, and interactive Compose UI flows.
 */
@OptIn(ExperimentalTestApi::class)
class EditWidgetDialogTest : BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @Test
    fun testHelperFunctionsAndPayloadBuilders() {
        assertEquals(7, AVAILABLE_VISUALIZATIONS.size)
        assertTrue(AVAILABLE_VISUALIZATIONS.contains("table"))

        val sqlWidget = WidgetResponse(
            id = "w-sql",
            dashboardId = "d-1",
            title = "ICU Census",
            subtitle = "Hourly",
            type = "SQL",
            visualization = "table",
            config = buildJsonObject {
                put("query", JsonPrimitive("SELECT 1"))
            }
        )
        val textWidget = WidgetResponse(
            id = "w-txt",
            dashboardId = "d-1",
            title = "Notes",
            type = "TEXT",
            visualization = "markdown",
            config = buildJsonObject {
                put("content", JsonPrimitive("# Header"))
            }
        )
        val httpWidget = WidgetResponse(
            id = "w-http",
            dashboardId = "d-1",
            title = "Webhook",
            type = "HTTP",
            visualization = "metric",
            config = buildJsonObject {
                put("url", JsonPrimitive("https://api.example.com/status"))
                put("subtitle", JsonPrimitive("Old Subtitle"))
            }
        )

        assertEquals("SELECT 1", extractInitialWidgetContent(sqlWidget))
        assertEquals("# Header", extractInitialWidgetContent(textWidget))
        assertEquals("https://api.example.com/status", extractInitialWidgetContent(httpWidget))

        assertEquals("Markdown Content", resolveWidgetContentLabel("text"))
        assertEquals("HTTP Endpoint URL", resolveWidgetContentLabel("http"))
        assertEquals("SQL Query", resolveWidgetContentLabel("sql"))

        val modelsWithoutDefault = listOf(
            ModelInfo(id = "gemini-2.5-pro", name = "Gemini 2.5 Pro", provider = "google", isLocal = false)
        )
        val resolvedWithPrepended = resolveAvailableProcessors(modelsWithoutDefault)
        assertEquals(ProcessorId.SQL_NO_MODEL, resolvedWithPrepended.first().id)
        assertEquals(2, resolvedWithPrepended.size)

        val modelsWithDefault = listOf(
            ModelInfo(id = "SQL", name = "SQL [no model]", provider = "sql", isLocal = true),
            ModelInfo(id = "gemini-2.5-pro", name = "Gemini 2.5 Pro", provider = "google", isLocal = false)
        )
        val resolvedAlreadyHasDefault = resolveAvailableProcessors(modelsWithDefault)
        assertEquals(2, resolvedAlreadyHasDefault.size)

        assertEquals(
            "SQL [no model]",
            resolveProcessorDisplayName(listOf(ProcessorSelectionOption.SQL_DEFAULT), ProcessorId.SQL_NO_MODEL)
        )
        assertEquals(
            "custom-proc",
            resolveProcessorDisplayName(listOf(ProcessorSelectionOption.SQL_DEFAULT), ProcessorId("custom-proc"))
        )

        // Build payloads across all branches
        val textUpdate = buildWidgetUpdatePayload(
            widget = textWidget,
            title = "Updated Notes",
            subtitle = "  New Sub  ",
            selectedViz = "markdown",
            sqlConfig = TypedWidgetConfig.Sql(query = "## Updated")
        )
        assertEquals("Updated Notes", textUpdate.title)
        assertEquals("New Sub", textUpdate.subtitle)
        assertEquals("## Updated", textUpdate.config?.get("content")?.jsonPrimitive?.content)
        assertEquals("New Sub", textUpdate.config?.get("subtitle")?.jsonPrimitive?.content)

        val httpUpdate = buildWidgetUpdatePayload(
            widget = httpWidget,
            title = "Updated Webhook",
            subtitle = "   ",
            selectedViz = "metric",
            sqlConfig = TypedWidgetConfig.Sql(query = "https://api.example.com/v2")
        )
        assertNull(httpUpdate.subtitle)
        assertFalse(httpUpdate.config?.containsKey("subtitle") == true)
        assertEquals("https://api.example.com/v2", httpUpdate.config?.get("url")?.jsonPrimitive?.content)

        // SQL without natural text or custom processor or existing key
        val sqlPlainUpdate = buildWidgetUpdatePayload(
            widget = sqlWidget,
            title = "Plain SQL",
            subtitle = "",
            selectedViz = "barchart",
            sqlConfig = TypedWidgetConfig.Sql(query = "SELECT 2")
        )
        assertEquals("SELECT 2", sqlPlainUpdate.config?.get("query")?.jsonPrimitive?.content)
        assertFalse(sqlPlainUpdate.config?.containsKey("allow_natural_text") == true)

        // SQL with allowNaturalText=true and non-blank prompt
        val sqlNaturalUpdate = buildWidgetUpdatePayload(
            widget = sqlWidget,
            title = "NL SQL",
            subtitle = "Sub",
            selectedViz = "table",
            sqlConfig = TypedWidgetConfig.Sql(
                query = "SELECT 3",
                allowNaturalText = true,
                processor = ProcessorId("gemini-2.5-pro"),
                naturalTextPrompt = "  Count active beds  "
            )
        )
        assertEquals("true", sqlNaturalUpdate.config?.get("allow_natural_text")?.jsonPrimitive?.content)
        assertEquals("gemini-2.5-pro", sqlNaturalUpdate.config?.get("processor")?.jsonPrimitive?.content)
        assertEquals("Count active beds", sqlNaturalUpdate.config?.get("natural_text_prompt")?.jsonPrimitive?.content)

        // SQL with allowNaturalText=false but custom processor and blank prompt
        val sqlCustomProcUpdate = buildWidgetUpdatePayload(
            widget = sqlWidget,
            title = "Custom Proc SQL",
            subtitle = "",
            selectedViz = "table",
            sqlConfig = TypedWidgetConfig.Sql(
                query = "SELECT 4",
                allowNaturalText = false,
                processor = ProcessorId("gemini-2.5-pro"),
                naturalTextPrompt = "   "
            )
        )
        assertEquals("false", sqlCustomProcUpdate.config?.get("allow_natural_text")?.jsonPrimitive?.content)
        assertFalse(sqlCustomProcUpdate.config?.containsKey("natural_text_prompt") == true)

        // SQL with existing allow_natural_text key in config when both allowNaturalText=false and SQL_NO_MODEL
        val sqlWithExistingKey = sqlWidget.copy(
            config = buildJsonObject {
                put("query", JsonPrimitive("SELECT 1"))
                put("allow_natural_text", JsonPrimitive(true))
            }
        )
        val sqlExistingKeyUpdate = buildWidgetUpdatePayload(
            widget = sqlWithExistingKey,
            title = "Existing Key SQL",
            subtitle = "",
            selectedViz = "table",
            sqlConfig = TypedWidgetConfig.Sql(query = "SELECT 5")
        )
        assertEquals("false", sqlExistingKeyUpdate.config?.get("allow_natural_text")?.jsonPrimitive?.content)
    }

    @Test
    fun testEditWidgetDialogUiInteractionsAndSave() = runComposeUiTest {
        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.contains("/ai/models") -> respond(
                    content = """[{"id":"gemini-2.5-pro","name":"Gemini 2.5 Pro","provider":"google","is_local":false}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/dashboards/widgets/w-1") -> respond(
                    content = """{"id":"w-1","dashboard_id":"d-1","title":"Updated ICU Title","subtitle":"Updated Sub","type":"SQL","visualization":"barchart","config":{"query":"SELECT count(*) FROM beds"}}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond("Error", HttpStatusCode.InternalServerError)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
        val aiApi = AiApi(baseUrl = "http://localhost", httpClient = client)
        val dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = client)

        val widget = WidgetResponse(
            id = "w-1",
            dashboardId = "d-1",
            title = "Initial ICU Title",
            type = "SQL",
            visualization = "table",
            config = buildJsonObject {
                put("query", JsonPrimitive("SELECT * FROM beds"))
            }
        )

        var updatedWidget: WidgetResponse? = null
        var dismissed = false

        setContent {
            MaterialTheme {
                EditWidgetDialog(
                    widget = widget,
                    onDismiss = { dismissed = true },
                    onWidgetUpdated = { updatedWidget = it },
                    dashboardsApi = dashboardsApi,
                    aiApi = aiApi
                )
            }
        }

        // Verify blank title validation error
        onNodeWithText("Initial ICU Title").performTextReplacement("")
        onNodeWithText("Save Changes").performClick()
        onNodeWithText("Widget title cannot be blank").assertIsDisplayed()

        // Fill valid title, subtitle, toggle natural text, change query
        onNodeWithText("Widget Title").performTextReplacement("Updated ICU Title")
        onNodeWithText("Subtitle / Caption").performTextReplacement("Updated Sub")

        // Open Visualization dropdown and select Barchart
        onNodeWithText("table").performClick()
        onNodeWithText("Barchart").performClick()

        // Open Processor dropdown and select Gemini 2.5 Pro
        onNodeWithContentDescription("Select query processor model or SQL").performScrollTo().performClick()
        waitForIdle()
        onNodeWithText("Gemini 2.5 Pro", substring = true).performClick()

        onNodeWithContentDescription("Allow user natural text input").performScrollTo().performClick()
        onNodeWithText("Default Natural Text Prompt").performScrollTo().performTextReplacement("Show active ICU beds")
        onNodeWithText("SELECT * FROM beds").performScrollTo().performTextReplacement("SELECT count(*) FROM beds")

        // Save Changes
        onNodeWithText("Save Changes").performClick()
        waitUntil(timeoutMillis = 15000) { updatedWidget != null }
        assertEquals("Updated ICU Title", updatedWidget?.title)

        // Dismiss button
        onNodeWithText("Cancel").performClick()
        assertTrue(dismissed)
    }

    @Test
    fun testEditWidgetDialogSaveErrorAndDefaultApi() = runComposeUiTest {
        val failEngine = MockEngine {
            respond(
                content = """{"detail":"Database write rejected"}""",
                status = HttpStatusCode.InternalServerError,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = HttpClient(failEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)

        val textWidget = WidgetResponse(
            id = "w-err",
            dashboardId = "d-1",
            title = "Markdown Card",
            type = "TEXT",
            visualization = "markdown",
            config = buildJsonObject {
                put("content", JsonPrimitive("Hello"))
            }
        )

        setContent {
            MaterialTheme {
                EditWidgetDialog(
                    widget = textWidget,
                    onDismiss = {},
                    onWidgetUpdated = {}
                )
            }
        }

        onNodeWithText("Save Changes").performClick()
        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Database write rejected", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Database write rejected", substring = true).assertIsDisplayed()
    }
}
