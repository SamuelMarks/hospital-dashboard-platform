package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.models.TemplateResponse
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

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
        assertEquals("wid-999", createdWidget.id)
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
        viewModel.updateWidgetSubtitle("  Explains SQL metric  ")
        viewModel.updateCustomWidgetContent("SELECT 1;")
        viewModel.updateCustomWidgetViz("bar_chart")

        var created: WidgetResponse? = null
        viewModel.submitCustomWidget { created = it }

        withTimeout(15000) {
            viewModel.state.first { it is WizardState.Success }
        }

        assertNotNull(created)
        assertEquals("wid-999", created.id)
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

    @Test
    fun testAllRemainingWizardBranches(): Unit = runBlocking {
        val customTemplatesApi = io.healthplatform.pulsequery.api.apis.TemplatesApi(
            baseUrl = "http://localhost",
            httpClient = HttpClient(MockEngine {
                respond(
                    content = sampleTemplatesJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true; isLenient = true })
                }
            }
        )
        val customDashboardsApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(
            baseUrl = "http://localhost",
            httpClient = HttpClient(MockEngine {
                respond(
                    content = sampleWidgetResponseJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true; isLenient = true })
                }
            }
        )

        val vm = WizardViewModel(
            dashboardId = "dash-explicit",
            scope = this,
            templatesApi = customTemplatesApi,
            dashboardsApi = customDashboardsApi
        )
        withTimeout(5000) {
            vm.state.first { it !is WizardState.Loading }
        }

        // Calling parameter/custom methods when state is TemplateSelection (early returns)
        vm.loadAvailableProcessors()
        kotlinx.coroutines.delay(50)
        vm.updateWidgetSubtitle("ignored")
        vm.updateCustomWidgetTitle("ignored")
        vm.updateCustomWidgetContent("ignored")
        vm.updateCustomWidgetViz("ignored")
        vm.updateCustomWidgetHttpMethod("ignored")
        vm.submitCustomWidget {}
        vm.updateParameterValue("k", "v")
        vm.updateWidgetTitle("ignored")
        vm.updateVisualization("ignored")
        vm.submitWidget {}
        vm.backToTemplates()

        // Search query matching description (and template with null description)
        val tplWithNullDesc = TemplateResponse(
            id = "tpl-null-desc",
            title = "Other Title",
            description = null,
            category = "Other",
            sqlTemplate = "SELECT 1",
            parametersSchema = null
        )
        // Select templates of all category types: census, bottlenecks, utilization, other
        val tplCensus = tplWithNullDesc.copy(category = "census")
        val tplBottlenecks = tplWithNullDesc.copy(category = "bottlenecks")
        val tplUtilization = tplWithNullDesc.copy(category = "utilization")
        val tplOther = tplWithNullDesc.copy(category = "general")

        vm.selectTemplate(tplCensus)
        assertEquals("bar_chart", (vm.state.value as WizardState.ParameterConfiguration).visualization)
        vm.updateWidgetSubtitle("  Custom Template Subtitle  ")
        assertEquals("  Custom Template Subtitle  ", (vm.state.value as WizardState.ParameterConfiguration).widgetSubtitle)
        vm.selectTemplate(tplBottlenecks)
        assertEquals("line_chart", (vm.state.value as WizardState.ParameterConfiguration).visualization)
        vm.selectTemplate(tplUtilization)
        assertEquals("line_chart", (vm.state.value as WizardState.ParameterConfiguration).visualization)
        vm.selectTemplate(tplOther)
        assertEquals("table", (vm.state.value as WizardState.ParameterConfiguration).visualization)

        // While in ParameterConfiguration, calling TemplateSelection methods is a no-op
        vm.selectCategory("Census")
        vm.updateSearchQuery("query")

        // Back to templates then search by description text ("probability")
        vm.backToTemplates()
        vm.selectCategory(null)
        vm.updateSearchQuery("probability")
        assertEquals(1, (vm.state.value as WizardState.TemplateSelection).filteredTemplates.size)

        // Custom HTTP widget with unknown HTTP method falls back to GET
        vm.startCustomWidget("HTTP")
        vm.updateCustomWidgetTitle("Valid Title")
        vm.updateWidgetSubtitle("  Custom HTTP Subtitle  ")
        vm.updateCustomWidgetContent("https://api.example.com")
        vm.updateCustomWidgetHttpMethod("INVALID_VERB")
        vm.submitCustomWidget {}
        withTimeout(5000) {
            vm.state.first { it is WizardState.Success }
        }

        // Schema extraction edge cases: non-object properties, non-array required, non-primitive required element,
        // non-object property entry, missing title/type/default
        val nonObjPropertiesSchema = buildJsonObject {
            put("properties", "not-an-object")
        }
        assertTrue(vm.extractParameterFields(nonObjPropertiesSchema).isEmpty())

        val complexSchema = buildJsonObject {
            putJsonObject("properties") {
                put("non_obj_prop", "primitive")
                putJsonObject("minimal_prop") {}
                putJsonObject("int_prop") {
                    put("title", 123) // non-string JsonPrimitive still has content
                    put("type", "integer")
                    putJsonObject("default") {} // non-primitive default
                }
                putJsonObject("num_prop") {
                    putJsonObject("title") {} // non-primitive title
                    putJsonObject("type") {} // non-primitive type -> defaults to "string"
                }
                putJsonObject("real_num_prop") {
                    put("title", "Threshold")
                    put("type", "number")
                    put("default", "3.14")
                }
            }
            putJsonArray("required") {
                add(kotlinx.serialization.json.JsonPrimitive("int_prop"))
                add(buildJsonObject {}) // non-primitive element in required array
            }
        }
        val extracted = vm.extractParameterFields(complexSchema)
        assertEquals(5, extracted.size)

        // Validate integer, number, and optional blank fields in submitWidget
        val tplValidation = TemplateResponse(
            id = "tpl-val",
            title = "Validation Tpl",
            description = null,
            category = "general",
            sqlTemplate = "SELECT {{int_prop}}, {{real_num_prop}}, '{{opt_str}}'",
            parametersSchema = buildJsonObject {
                put("required", "not-an-array")
                putJsonObject("properties") {
                    putJsonObject("int_prop") {
                        put("title", "Count")
                        put("type", "integer")
                    }
                    putJsonObject("real_num_prop") {
                        put("title", "Ratio")
                        put("type", "number")
                    }
                    putJsonObject("opt_str") {
                        put("title", "Optional")
                        put("type", "string")
                    }
                }
            }
        )
        vm.selectTemplate(tplValidation)
        // Missing required int_prop (null in map if removed or blank) and invalid number
        vm.updateParameterValue("int_prop", "not_int")
        vm.updateParameterValue("real_num_prop", "not_num")
        vm.updateParameterValue("opt_str", "")
        vm.submitWidget {}
        var paramState = vm.state.value as WizardState.ParameterConfiguration
        assertEquals("Count must be a valid integer", paramState.fieldErrors["int_prop"])
        assertEquals("Ratio must be a valid number", paramState.fieldErrors["real_num_prop"])

        // Search templates when one template has description == null
        val customTemplatesWithNullDescApi = io.healthplatform.pulsequery.api.apis.TemplatesApi(
            baseUrl = "http://localhost",
            httpClient = HttpClient(MockEngine {
                respond(
                    content = """[{"id":"t-null","title":"NoDesc","description":null,"category":"General","sql_template":"SELECT 1","parameters_schema":null}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true; isLenient = true })
                }
            }
        )
        val vmNullDesc = WizardViewModel(dashboardId = "d-1", scope = this, templatesApi = customTemplatesWithNullDescApi)
        withTimeout(5000) {
            vmNullDesc.state.first { it !is WizardState.Loading }
        }
        vmNullDesc.updateSearchQuery("unmatched")
        assertTrue((vmNullDesc.state.value as WizardState.TemplateSelection).filteredTemplates.isEmpty())

        // Valid integer and valid number
        vm.updateParameterValue("int_prop", "10")
        vm.updateParameterValue("real_num_prop", "2.5")
        vm.submitWidget {}
        withTimeout(5000) {
            vm.state.first { it is WizardState.Success }
        }

        vm.selectTemplate(tplValidation)
        val currentParamState = vm.state.value as WizardState.ParameterConfiguration
        // Substitute parameters with integer, number (valid & invalid), and string with single quotes
        val fields = listOf(
            ParameterField("i1", "I1", "integer", "0", false),
            ParameterField("i2", "I2", "integer", "0", false),
            ParameterField("n1", "N1", "number", "0.0", false),
            ParameterField("n2", "N2", "number", "0.0", false),
            ParameterField("s1", "S1", "string", "", false),
            currentParamState.parameterFields.first()
        )
        val subbed = vm.substituteParameters(
            "SELECT {{i1}}, {{i2}}, {{n1}}, {{n2}}, '{{s1}}'",
            mapOf("i1" to "42", "i2" to "bad", "n1" to "3.5", "n2" to "bad", "s1" to "O'Reilly"),
            fields
        )
        assertEquals("SELECT 42, 0, 3.5, 0.0, 'O''Reilly'", subbed)

        // Load templates failure with null message and submitWidget failure with null message
        val nullFailClient = HttpClient(MockEngine { throw RuntimeException(null as String?) }) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        val nullFailTemplatesApi = io.healthplatform.pulsequery.api.apis.TemplatesApi(
            baseUrl = "http://localhost",
            httpClient = nullFailClient
        )
        val nullFailDashboardsApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(
            baseUrl = "http://localhost",
            httpClient = nullFailClient
        )
        val vmNullFail = WizardViewModel(
            dashboardId = "d-fail",
            scope = this,
            templatesApi = nullFailTemplatesApi,
            dashboardsApi = nullFailDashboardsApi
        )
        val errLoad = withTimeout(5000) {
            vmNullFail.state.first { it is WizardState.Error }
        } as WizardState.Error
        assertEquals("Failed to load templates", errLoad.message)

        vmNullFail.startCustomWidget("SQL")
        vmNullFail.updateCustomWidgetTitle("T")
        vmNullFail.updateCustomWidgetContent("SELECT 1")
        vmNullFail.submitCustomWidget {}
        val errCreate = withTimeout(5000) {
            vmNullFail.state.first { it is WizardState.Error }
        } as WizardState.Error
        assertEquals("Failed to create widget", errCreate.message)

        // Test processor loading, mapModelInfoToProcessorSelection, and natural text mutations
        val modelsJson = """
            [
              {"id":"SQL","name":"SQL [no model]","provider":"sql","is_local":true,"processor_type":"SQL"},
              {"id":"ollama:llama3","name":"Llama 3","provider":"ollama","is_local":true,"processor_type":"OLLAMA"},
              {"id":"openai:gpt-4o","name":"GPT-4o","provider":"openai","is_local":false,"processor_type":"ANY_LLM"}
            ]
        """.trimIndent()
        val aiClientOk = HttpClient(MockEngine {
            respond(
                content = modelsJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        val aiApiOk = io.healthplatform.pulsequery.api.apis.AiApi(baseUrl = "http://localhost", httpClient = aiClientOk)

        val vmWithAi = WizardViewModel(
            dashboardId = "d-ai",
            scope = this,
            templatesApi = customTemplatesApi,
            dashboardsApi = customDashboardsApi,
            aiApi = aiApiOk
        )
        withTimeout(5000) {
            vmWithAi.state.first { it is WizardState.TemplateSelection }
        }

        // Calling natural text mutations while in TemplateSelection (else branch)
        vmWithAi.updateAllowNaturalText(true)
        vmWithAi.selectProcessor(io.healthplatform.pulsequery.core.model.ProcessorId("ollama:llama3"))
        vmWithAi.updateNaturalTextPrompt("prompt")
        vmWithAi.updatePlaceholderText("placeholder")

        // In CustomWidgetConfiguration
        vmWithAi.startCustomWidget("SQL")
        vmWithAi.loadAvailableProcessors()
        kotlinx.coroutines.delay(50)
        vmWithAi.updateCustomWidgetTitle("NL SQL Widget")
        vmWithAi.updateAllowNaturalText(true)
        vmWithAi.selectProcessor(io.healthplatform.pulsequery.core.model.ProcessorId("ollama:llama3"))
        vmWithAi.updateNaturalTextPrompt("  Show ICU patients  ")
        vmWithAi.updatePlaceholderText("  Ask question  ")
        // With allowNaturalText=true on SQL widget, empty queryOrUrlOrContent is valid
        vmWithAi.submitCustomWidget {}
        withTimeout(5000) {
            vmWithAi.state.first { it is WizardState.Success }
        }

        // In ParameterConfiguration
        vmWithAi.selectTemplate(tplOther.copy(parametersSchema = null))
        vmWithAi.updateVisualization("bar_chart")
        vmWithAi.loadAvailableProcessors()
        kotlinx.coroutines.delay(100)
        vmWithAi.updateAllowNaturalText(true)
        vmWithAi.selectProcessor(io.healthplatform.pulsequery.core.model.ProcessorId("openai:gpt-4o"))
        vmWithAi.updateNaturalTextPrompt("  Count by ward  ")
        vmWithAi.updatePlaceholderText("  Enter prompt  ")
        vmWithAi.submitWidget {}
        withTimeout(5000) {
            vmWithAi.state.first { it is WizardState.Success }
        }

        // Test loadAvailableProcessors when SQL is omitted from response & when AI API fails
        val aiClientNoSql = HttpClient(MockEngine {
            respond(
                content = """[{"id":"ollama/mistral","name":"","provider":"","is_local":false,"processor_type":"ANY_LLM"}]""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        val vmNoSql = WizardViewModel(
            dashboardId = "d-nosql",
            scope = this,
            templatesApi = customTemplatesApi,
            dashboardsApi = customDashboardsApi,
            aiApi = io.healthplatform.pulsequery.api.apis.AiApi(baseUrl = "http://localhost", httpClient = aiClientNoSql)
        )
        kotlinx.coroutines.delay(50)
        vmNoSql.startCustomWidget("SQL")
        assertEquals(2, (vmNoSql.state.value as WizardState.CustomWidgetConfiguration).availableProcessors.size)

        val vmAiFail = WizardViewModel(
            dashboardId = "d-aifail",
            scope = this,
            templatesApi = customTemplatesApi,
            dashboardsApi = customDashboardsApi,
            aiApi = io.healthplatform.pulsequery.api.apis.AiApi(baseUrl = "http://localhost", httpClient = nullFailClient)
        )
        kotlinx.coroutines.delay(50)
        vmAiFail.startCustomWidget("SQL")
        assertEquals(1, (vmAiFail.state.value as WizardState.CustomWidgetConfiguration).availableProcessors.size)

        // Direct mapModelInfoToProcessorSelection coverage for remaining branches
        val mSqlBlank = mapModelInfoToProcessorSelection(
            io.healthplatform.pulsequery.api.models.ModelInfo(id = "other", name = "", provider = "", isLocal = false, processorType = "SQL")
        )
        assertEquals(io.healthplatform.pulsequery.core.model.ProcessorId.SQL_NO_MODEL, mSqlBlank.id)
        val mOllamaPrefix = mapModelInfoToProcessorSelection(
            io.healthplatform.pulsequery.api.models.ModelInfo(id = "ollama:phi3", name = "Phi3", provider = "custom", isLocal = false, processorType = "ANY_LLM")
        )
        assertEquals(io.healthplatform.pulsequery.core.model.ProcessorCategory.OLLAMA, mOllamaPrefix.category)
        val mOllamaProvider = mapModelInfoToProcessorSelection(
            io.healthplatform.pulsequery.api.models.ModelInfo(id = "phi3", name = "Phi3", provider = "ollama", isLocal = false, processorType = "ANY_LLM")
        )
        assertEquals(io.healthplatform.pulsequery.core.model.ProcessorCategory.OLLAMA, mOllamaProvider.category)
        val mLocal = mapModelInfoToProcessorSelection(
            io.healthplatform.pulsequery.api.models.ModelInfo(id = "local:m", name = "Loc", provider = "loc", isLocal = true, processorType = "ANY_LLM")
        )
        assertEquals(io.healthplatform.pulsequery.core.model.ProcessorCategory.OLLAMA, mLocal.category)
    }
}
