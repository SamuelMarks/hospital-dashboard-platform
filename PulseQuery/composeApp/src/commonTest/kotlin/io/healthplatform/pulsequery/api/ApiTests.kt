package io.healthplatform.pulsequery.api

import io.healthplatform.pulsequery.api.apis.AdminApi
import io.healthplatform.pulsequery.api.apis.AnalyticsApi
import io.healthplatform.pulsequery.api.apis.BenchmarksApi
import io.healthplatform.pulsequery.api.apis.ChatApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.ExecutionApi
import io.healthplatform.pulsequery.api.apis.OptimizationApi
import io.healthplatform.pulsequery.api.apis.SchemaApi
import io.healthplatform.pulsequery.api.apis.SystemApi
import io.healthplatform.pulsequery.api.apis.TemplatesApi
import io.healthplatform.pulsequery.api.models.DashboardCreate
import io.healthplatform.pulsequery.api.models.OptimizationSolutionPayload
import io.healthplatform.pulsequery.api.models.OptimizationSolveRequest
import io.healthplatform.pulsequery.api.models.ServiceUnitConstraint
import io.healthplatform.pulsequery.createInspectingMockEngine
import io.healthplatform.pulsequery.createMockClient
import io.healthplatform.pulsequery.readBodyText
import io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsViewModel
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests verifying KMP API client request serialization (query params, headers, JSON body),
 * HTTP error responses (400, 401, 403, 404, 500), and ViewModel state transitions.
 */
class ApiTests {

    @Test
    fun testDashboardsApiRequestSerializationAndDeserialization() = runTest {
        val requests = mutableListOf<HttpRequestData>()
        val engine = createInspectingMockEngine(recordedRequests = requests)
        val client = createMockClient(engine = engine, bearerToken = "jwt-dash-token")
        val api = DashboardsApi(baseUrl = "http://localhost:8000", httpClient = client)

        val listResponse = api.listDashboardsApiV1DashboardsGet()
        assertTrue(listResponse.success)
        val dashboards = listResponse.body()
        assertEquals(1, dashboards.size)
        assertEquals("1", dashboards[0].id)
        assertEquals("Main", dashboards[0].name)

        val getReq = requests.last()
        assertEquals(HttpMethod.Get, getReq.method)
        assertEquals("/api/v1/dashboards", getReq.url.encodedPath)
        assertEquals("Bearer jwt-dash-token", getReq.headers[HttpHeaders.Authorization])

        val createResponse = api.createDashboardApiV1DashboardsPost(DashboardCreate(name = "ICU Ops"))
        assertTrue(createResponse.success)
        assertEquals("dash-new", createResponse.body().id)

        val postReq = requests.last()
        assertEquals(HttpMethod.Post, postReq.method)
        val bodyJson = Json.parseToJsonElement(postReq.body.readBodyText()).jsonObject
        assertEquals("ICU Ops", bodyJson["name"]?.jsonPrimitive?.content)
    }

    @Test
    fun testAnalyticsApiQueryParamsAndHeaders() = runTest {
        val requests = mutableListOf<HttpRequestData>()
        val engine = createInspectingMockEngine(recordedRequests = requests)
        val client = createMockClient(engine = engine, bearerToken = "analytics-token")
        val api = AnalyticsApi(baseUrl = "http://localhost:8000", httpClient = client)

        val response = api.listLlmOutputsApiV1AnalyticsLlmGet(
            limit = 25,
            offset = 10
        )
        assertTrue(response.success)
        val rows = response.body()
        assertEquals(1, rows.size)
        assertEquals("gpt-4o", rows[0].llm)
        assertEquals("u1@hospital.org", rows[0].userEmail)

        val req = requests.single()
        assertEquals("/api/v1/analytics/llm", req.url.encodedPath)
        assertEquals("10", req.url.parameters["offset"])
        assertEquals("25", req.url.parameters["limit"])
        assertEquals("Bearer analytics-token", req.headers[HttpHeaders.Authorization])
    }

    @Test
    fun testChatApiQueryParamsAndPostBody() = runTest {
        val requests = mutableListOf<HttpRequestData>()
        val engine = createInspectingMockEngine(recordedRequests = requests)
        val client = createMockClient(engine = engine)
        val api = ChatApi(baseUrl = "http://localhost:8000", httpClient = client)

        val response = api.listConversationsApiV1ConversationsGet(limit = 15, offset = 5)
        assertTrue(response.success)
        assertEquals("Test E2E", response.body().first().title)

        val listReq = requests.last()
        assertEquals("5", listReq.url.parameters["offset"])
        assertEquals("15", listReq.url.parameters["limit"])
    }

    @Test
    fun testAdminApiAndTemplatesAndSchemaAndSystemAndBenchmarks() = runTest {
        val requests = mutableListOf<HttpRequestData>()
        val engine = createInspectingMockEngine(recordedRequests = requests)
        val client = createMockClient(engine = engine)

        val adminApi = AdminApi(baseUrl = "http://localhost:8000", httpClient = client)
        val adminRes = adminApi.readAdminSettingsApiV1AdminSettingsGet()
        assertEquals("sk-***", adminRes.body().apiKeys["openai"])
        assertEquals(listOf("gpt-4o"), adminRes.body().visibleModels)

        val templatesApi = TemplatesApi(baseUrl = "http://localhost:8000", httpClient = client)
        val tplRes = templatesApi.listTemplatesApiV1TemplatesGet(category = "Census", limit = 50)
        assertEquals("ICU Census", tplRes.body().first().title)
        val tplReq = requests.last()
        assertEquals("Census", tplReq.url.parameters["category"])
        assertEquals("50", tplReq.url.parameters["limit"])

        val schemaApi = SchemaApi(baseUrl = "http://localhost:8000", httpClient = client)
        val schemaRes = schemaApi.getDatabaseSchemaApiV1SchemaGet()
        assertEquals("admissions", schemaRes.body().first().tableName)

        val systemApi = SystemApi(baseUrl = "http://localhost:8000", httpClient = client)
        val healthRes = systemApi.getSystemHealthApiV1SystemHealthGet()
        assertEquals("healthy", healthRes.body().overallStatus)

        val benchmarksApi = BenchmarksApi(baseUrl = "http://localhost:8000", httpClient = client)
        val sqlRes = benchmarksApi.getSqlBenchmarksApiV1BenchmarksSqlGet()
        assertTrue(sqlRes.body().isNotEmpty())
        val optRes = benchmarksApi.getOptimizationBenchmarksApiV1BenchmarksOptimizationGet()
        assertTrue(optRes.body().isNotEmpty())
    }

    @Test
    fun testExecutionApiSerializesGlobalFilterBody() = runTest {
        val requests = mutableListOf<HttpRequestData>()
        val engine = createInspectingMockEngine(recordedRequests = requests)
        val client = createMockClient(engine = engine)
        val api = ExecutionApi(baseUrl = "http://localhost:8000", httpClient = client)

        val filters = mapOf(
            "department" to JsonPrimitive("ICU"),
            "time_range" to JsonPrimitive("7d")
        )
        val response = api.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
            dashboardId = "1",
            requestBody = filters
        )
        assertTrue(response.success)
        assertTrue(response.body().containsKey("w1"))

        val req = requests.last()
        assertEquals(HttpMethod.Post, req.method)
        assertEquals("/api/v1/dashboards/1/refresh", req.url.encodedPath)
        val sentJson = Json.parseToJsonElement(req.body.readBodyText()).jsonObject
        assertEquals("ICU", sentJson["department"]?.jsonPrimitive?.content)
        assertEquals("7d", sentJson["time_range"]?.jsonPrimitive?.content)

        val widgetRes = api.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
            dashboardId = "1",
            widgetId = "1"
        )
        assertTrue(widgetRes.success)
        assertNotNull(widgetRes.body())
    }

    @Test
    fun testOptimizationSolveRequestBodyStructure() = runTest {
        val requests = mutableListOf<HttpRequestData>()
        val engine = createInspectingMockEngine(recordedRequests = requests)
        val client = createMockClient(engine = engine)

        val optApi = OptimizationApi(baseUrl = "http://localhost:8000", httpClient = client)
        val solveReq = OptimizationSolveRequest(
            useCase = OptimizationSolveRequest.UseCase.surgical_scheduling,
            institutionId = "chop",
            prompt = "Open 10 additional beds on PCU 360",
            serviceConstraints = listOf(
                ServiceUnitConstraint(
                    constraintType = ServiceUnitConstraint.ConstraintType.unit_capacity_delta,
                    unit = "PCU 360",
                    `value` = 10.0
                )
            )
        )
        val solveRes = optApi.solveOptimizationStatelessApiV1OptimizationSolvePost(solveReq)
        assertEquals(OptimizationSolutionPayload.SolverStatus.OPTIMAL, solveRes.body().solverStatus)

        val sentJson = Json.parseToJsonElement(requests.last().body.readBodyText()).jsonObject
        assertEquals("surgical_scheduling", sentJson["use_case"]?.jsonPrimitive?.content)
        assertEquals("chop", sentJson["institution_id"]?.jsonPrimitive?.content)
        assertEquals(1, sentJson["service_constraints"]?.jsonArray?.size)
    }

    @Test
    fun testHttpErrorResponses400And401And403And404And500() = runTest {
        val errorStatuses = listOf(
            HttpStatusCode.BadRequest,
            HttpStatusCode.Unauthorized,
            HttpStatusCode.Forbidden,
            HttpStatusCode.NotFound,
            HttpStatusCode.InternalServerError
        )

        for (status in errorStatuses) {
            val engine = createInspectingMockEngine(
                forcedStatus = status,
                forcedErrorBody = """{"detail":"Error ${status.value}"}"""
            )
            // 1. Verify non-throwing response status inspection when expectSuccess = false
            val lenientClient = createMockClient(engine = engine, expectSuccess = false)
            val lenientApi = DashboardsApi(baseUrl = "http://localhost:8000", httpClient = lenientClient)
            val httpResponse = lenientApi.listDashboardsApiV1DashboardsGet()
            assertFalse(httpResponse.success, "Expected success=false for status ${status.value}")
            assertEquals(status.value, httpResponse.status)

            // 2. Verify exception propagation when expectSuccess = true
            val strictClient = createMockClient(engine = engine, expectSuccess = true)
            val strictApi = DashboardsApi(baseUrl = "http://localhost:8000", httpClient = strictClient)
            val caught = runCatching { strictApi.listDashboardsApiV1DashboardsGet().body() }
            assertTrue(caught.isFailure, "Expected failure for status ${status.value}")
        }
    }

    @Test
    fun testViewModelStateTransitionsOnSuccessAndHttpError() = runTest {
        val okEngine = createInspectingMockEngine()
        val okClient = createMockClient(engine = okEngine, expectSuccess = true)
        val okAnalyticsApi = AnalyticsApi(baseUrl = "http://localhost:8000", httpClient = okClient)

        val viewModelOk = AnalyticsViewModel(scope = this, analyticsApi = okAnalyticsApi)
        assertTrue(viewModelOk.state.value.isLoading)
        viewModelOk.loadAnalytics()
        val loadedState = viewModelOk.state.first { !it.isLoading }
        assertNull(loadedState.errorMessage)
        assertEquals(1, loadedState.records.size)
        assertEquals("gpt-4o", loadedState.records[0].llm)

        val failEngine = createInspectingMockEngine(forcedStatus = HttpStatusCode.InternalServerError)
        val failClient = createMockClient(engine = failEngine, expectSuccess = true)
        val failAnalyticsApi = AnalyticsApi(baseUrl = "http://localhost:8000", httpClient = failClient)

        val viewModelFail = AnalyticsViewModel(scope = this, analyticsApi = failAnalyticsApi)
        viewModelFail.loadAnalytics()
        val errorState = viewModelFail.state.first { !it.isLoading }
        assertNotNull(errorState.errorMessage)
        assertTrue(errorState.records.isEmpty())
    }
}
