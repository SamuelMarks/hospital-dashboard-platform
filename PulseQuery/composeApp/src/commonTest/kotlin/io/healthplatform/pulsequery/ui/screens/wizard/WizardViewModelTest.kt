package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.TemplateResponse
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetResponse
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.test.*

/**
 * Unit tests verifying state machine transitions, template extraction, validation,
 * and widget submission in [WizardViewModel].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WizardViewModelTest {

    private val testScheduler = TestCoroutineScheduler()
    private val testDispatcher = StandardTestDispatcher(testScheduler)
    private val testScope = TestScope(testDispatcher)

    private val sampleTemplatesJson = """
        [
          {
            "id": "tpl-1",
            "title": "Predictive Availability",
            "description": "Calculate probability of bed availability",
            "category": "Availability",
            "sql_template": "SELECT '{{target_ward}}', {{capacity}};",
            "parameters_schema": {
              "type": "object",
              "properties": {
                "target_ward": {
                  "type": "string",
                  "default": "ICU",
                  "title": "Target Ward"
                },
                "capacity": {
                  "type": "integer",
                  "default": 20,
                  "title": "Ward Capacity"
                }
              },
              "required": ["target_ward"]
            }
          },
          {
            "id": "tpl-2",
            "title": "Census Overview",
            "description": "Daily census aggregate",
            "category": "Census",
            "sql_template": "SELECT * FROM synthetic_hospital_data;",
            "parameters_schema": null
          }
        ]
    """.trimIndent()

    private val sampleWidgetResponseJson = """
        {
          "id": "wid-999",
          "dashboard_id": "dash-123",
          "title": "Predictive Availability",
          "type": "SQL",
          "visualization": "bar_chart",
          "config": {
            "query": "SELECT 'ICU', 20;"
          }
        }
    """.trimIndent()

    private fun configureMockEngine(
        templatesStatusCode: HttpStatusCode = HttpStatusCode.OK,
        widgetStatusCode: HttpStatusCode = HttpStatusCode.OK
    ) {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("templates") -> {
                    if (templatesStatusCode == HttpStatusCode.OK) {
                        respond(
                            content = sampleTemplatesJson,
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond("Server error", status = templatesStatusCode)
                    }
                }
                request.url.encodedPath.contains("widgets") -> {
                    if (widgetStatusCode == HttpStatusCode.OK) {
                        respond(
                            content = sampleWidgetResponseJson,
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond("Creation failed", status = widgetStatusCode)
                    }
                }
                else -> respond("Not Found", status = HttpStatusCode.NotFound)
            }
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
        AppContainer.resetForTest()
    }

    @Test
    fun testLoadTemplatesSuccess() = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        assertIs<WizardState.TemplateSelection>(state)
        assertEquals(2, state.templates.size)
        assertEquals(listOf("Availability", "Census"), state.categories)
        assertNull(state.selectedCategory)
        assertEquals("", state.searchQuery)
    }

    @Test
    fun testLoadTemplatesFailure() = runBlocking {
        configureMockEngine(templatesStatusCode = HttpStatusCode.InternalServerError)
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        assertIs<WizardState.Error>(state)
        assertTrue(state.message.isNotEmpty())
    }

    @Test
    fun testSelectCategoryAndSearchFilter() = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        withTimeout(5000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        // Filter by category
        viewModel.selectCategory("Census")
        var state = viewModel.state.value
        assertIs<WizardState.TemplateSelection>(state)
        assertEquals("Census", state.selectedCategory)
        assertEquals(1, state.filteredTemplates.size)
        assertEquals("Census Overview", state.filteredTemplates[0].title)

        // Reset category
        viewModel.selectCategory(null)
        state = viewModel.state.value
        assertIs<WizardState.TemplateSelection>(state)
        assertEquals(2, state.filteredTemplates.size)

        // Search query
        viewModel.updateSearchQuery("Predictive")
        state = viewModel.state.value
        assertIs<WizardState.TemplateSelection>(state)
        assertEquals(1, state.filteredTemplates.size)
        assertEquals("Predictive Availability", state.filteredTemplates[0].title)

        // No matches
        viewModel.updateSearchQuery("NonExistentQuery")
        state = viewModel.state.value
        assertIs<WizardState.TemplateSelection>(state)
        assertTrue(state.filteredTemplates.isEmpty())
    }

    @Test
    fun testSelectTemplateAndParameterConfiguration() = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        val stateSelection = state as WizardState.TemplateSelection
        val template = stateSelection.templates[0]

        viewModel.selectTemplate(template)
        var configState = viewModel.state.value
        assertIs<WizardState.ParameterConfiguration>(configState)
        assertEquals("Predictive Availability", configState.widgetTitle)
        assertEquals("bar_chart", configState.visualization)
        assertEquals(2, configState.parameterFields.size)
        assertEquals("ICU", configState.parameterValues["target_ward"])
        assertEquals("20", configState.parameterValues["capacity"])

        // Update parameter
        viewModel.updateParameterValue("target_ward", "NICU")
        configState = viewModel.state.value as WizardState.ParameterConfiguration
        assertEquals("NICU", configState.parameterValues["target_ward"])

        // Update title
        viewModel.updateWidgetTitle("Custom Ward Availability")
        configState = viewModel.state.value as WizardState.ParameterConfiguration
        assertEquals("Custom Ward Availability", configState.widgetTitle)

        // Update visualization
        viewModel.updateVisualization("line_chart")
        configState = viewModel.state.value as WizardState.ParameterConfiguration
        assertEquals("line_chart", configState.visualization)

        // Back to templates
        viewModel.backToTemplates()
        val backState = viewModel.state.value
        assertIs<WizardState.TemplateSelection>(backState)
        assertEquals("Availability", backState.selectedCategory)
    }

    @Test
    fun testSubmitWidgetValidationFailure() = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        val stateSelection = state as WizardState.TemplateSelection
        viewModel.selectTemplate(stateSelection.templates[0])

        // Blank title and blank required field
        viewModel.updateWidgetTitle("   ")
        viewModel.updateParameterValue("target_ward", "   ")

        var successCalled = false
        viewModel.submitWidget { successCalled = true }

        assertFalse(successCalled)
        val failedState = viewModel.state.value
        assertIs<WizardState.ParameterConfiguration>(failedState)
        assertTrue(failedState.fieldErrors.containsKey("title"))
        assertTrue(failedState.fieldErrors.containsKey("target_ward"))
    }

    @Test
    fun testSubmitWidgetSuccess() = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        val stateSelection = state as WizardState.TemplateSelection
        viewModel.selectTemplate(stateSelection.templates[0])

        var createdWidget: WidgetResponse? = null
        viewModel.submitWidget { createdWidget = it }

        val successState = withTimeout(5000) {
            viewModel.state.first { it is WizardState.Success }
        }

        assertNotNull(createdWidget)
        assertEquals("wid-999", createdWidget?.id)
        assertIs<WizardState.Success>(successState)
        assertEquals("wid-999", successState.widget.id)
    }

    @Test
    fun testSubmitWidgetFailure() = runBlocking {
        configureMockEngine(widgetStatusCode = HttpStatusCode.InternalServerError)
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        val state = withTimeout(5000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        val stateSelection = state as WizardState.TemplateSelection
        viewModel.selectTemplate(stateSelection.templates[0])

        var successCalled = false
        viewModel.submitWidget { successCalled = true }

        val errorState = withTimeout(5000) {
            viewModel.state.first { it is WizardState.Error }
        }

        assertFalse(successCalled)
        assertIs<WizardState.Error>(errorState)
        assertTrue(errorState.message.isNotEmpty())
    }

    @Test
    fun testExtractParameterFieldsVariations() {
        val viewModel = WizardViewModel(dashboardId = "test", scope = testScope)

        // Null schema
        assertTrue(viewModel.extractParameterFields(null).isEmpty())

        // Empty schema
        val emptySchema = buildJsonObject {}
        assertTrue(viewModel.extractParameterFields(emptySchema).isEmpty())

        // Schema with missing optional fields
        val schemaWithoutRequired = buildJsonObject {
            putJsonObject("properties") {
                putJsonObject("param1") {
                    put("title", "Custom Title")
                    put("type", "integer")
                    put("default", 42)
                }
            }
        }
        val fields = viewModel.extractParameterFields(schemaWithoutRequired)
        assertEquals(1, fields.size)
        assertEquals("param1", fields[0].key)
        assertEquals("Custom Title", fields[0].title)
        assertEquals("integer", fields[0].type)
        assertEquals("42", fields[0].defaultValue)
        assertFalse(fields[0].isRequired)
    }

    @Test
    fun testSubstituteParameters() {
        val viewModel = WizardViewModel(dashboardId = "test", scope = testScope)
        val sql = "SELECT * FROM data WHERE ward = '{{ward}}' AND cap > {{ cap }};"
        val params = mapOf("ward" to "ICU", "cap" to "10")

        val result = viewModel.substituteParameters(sql, params)
        assertEquals("SELECT * FROM data WHERE ward = 'ICU' AND cap > 10;", result)
    }

    @Test
    fun testCustomSqlWidgetCreation(): Unit = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        withTimeout(15000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        viewModel.startCustomWidget("SQL")
        val state = viewModel.state.value as WizardState.CustomWidgetConfiguration
        assertEquals("SQL", state.creationType)
        assertEquals("table", state.visualization)

        viewModel.updateCustomWidgetTitle("My Ad-Hoc SQL")
        viewModel.updateCustomWidgetContent("SELECT 1;")
        viewModel.updateCustomWidgetViz("bar_chart")

        var created: WidgetResponse? = null
        viewModel.submitCustomWidget { created = it }

        withTimeout(15000) {
            viewModel.state.first { it is WizardState.Success }
        }

        assertNotNull(created)
        assertEquals("wid-999", created?.id)
    }

    @Test
    fun testCustomHttpWidgetCreation(): Unit = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        withTimeout(15000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        viewModel.startCustomWidget("HTTP")
        val state = viewModel.state.value as WizardState.CustomWidgetConfiguration
        assertEquals("HTTP", state.creationType)

        viewModel.updateCustomWidgetTitle("External FHIR API")
        viewModel.updateCustomWidgetContent("https://api.hospital.org/v1/patients")
        viewModel.updateCustomWidgetHttpMethod("POST")

        var created: WidgetResponse? = null
        viewModel.submitCustomWidget { created = it }

        withTimeout(15000) {
            viewModel.state.first { it is WizardState.Success }
        }

        assertNotNull(created)
    }

    @Test
    fun testCustomTextWidgetCreation(): Unit = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        withTimeout(15000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        viewModel.startCustomWidget("TEXT")
        val state = viewModel.state.value as WizardState.CustomWidgetConfiguration
        assertEquals("TEXT", state.creationType)
        assertEquals("markdown", state.visualization)

        viewModel.updateCustomWidgetTitle("Shift Handover Note")
        viewModel.updateCustomWidgetContent("# Shift Summary\nAll beds full.")

        var created: WidgetResponse? = null
        viewModel.submitCustomWidget { created = it }

        withTimeout(15000) {
            viewModel.state.first { it is WizardState.Success }
        }

        assertNotNull(created)
    }

    @Test
    fun testCustomWidgetValidationErrors(): Unit = runBlocking {
        configureMockEngine()
        val viewModel = WizardViewModel(dashboardId = "dash-123", scope = this)
        withTimeout(15000) {
            viewModel.state.first { it !is WizardState.Loading }
        }

        viewModel.startCustomWidget("SQL")
        viewModel.updateCustomWidgetTitle("")
        viewModel.updateCustomWidgetContent("")

        var created: WidgetResponse? = null
        viewModel.submitCustomWidget { created = it }

        assertNull(created)
        val state = viewModel.state.value as WizardState.CustomWidgetConfiguration
        assertTrue(state.fieldErrors.containsKey("title"))
        assertTrue(state.fieldErrors.containsKey("content"))
    }
}
