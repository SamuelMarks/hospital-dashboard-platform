/**
 * Comprehensive unit tests for all generated OpenAPI Ktor client services in `io.healthplatform.pulsequery.api.apis`.
 */
package io.healthplatform.pulsequery.api

import io.healthplatform.pulsequery.api.apis.AdminApi
import io.healthplatform.pulsequery.api.apis.AdminUsersApi
import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.api.apis.AlertRulesApi
import io.healthplatform.pulsequery.api.apis.AnalyticsApi
import io.healthplatform.pulsequery.api.apis.AuthApi
import io.healthplatform.pulsequery.api.apis.BenchmarksApi
import io.healthplatform.pulsequery.api.apis.ChatApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.DefaultApi
import io.healthplatform.pulsequery.api.apis.ExecutionApi
import io.healthplatform.pulsequery.api.apis.OptimizationApi
import io.healthplatform.pulsequery.api.apis.SchemaApi
import io.healthplatform.pulsequery.api.apis.SystemApi
import io.healthplatform.pulsequery.api.apis.TemplatesApi
import io.healthplatform.pulsequery.api.infrastructure.ApiClient
import io.healthplatform.pulsequery.api.models.AdminSettingsUpdateRequest
import io.healthplatform.pulsequery.api.models.AlertRuleCreate
import io.healthplatform.pulsequery.api.models.AlertRuleUpdate
import io.healthplatform.pulsequery.api.models.ConversationCreate
import io.healthplatform.pulsequery.api.models.ConversationUpdate
import io.healthplatform.pulsequery.api.models.DashboardCreate
import io.healthplatform.pulsequery.api.models.DashboardShareCreate
import io.healthplatform.pulsequery.api.models.ForgotPasswordRequest
import io.healthplatform.pulsequery.api.models.MessageCreate
import io.healthplatform.pulsequery.api.models.MessageVoteRequest
import io.healthplatform.pulsequery.api.models.OptimizationIterationRequest
import io.healthplatform.pulsequery.api.models.OptimizationSessionCreate
import io.healthplatform.pulsequery.api.models.OptimizationSolutionPayload
import io.healthplatform.pulsequery.api.models.OptimizationSolveRequest
import io.healthplatform.pulsequery.api.models.OptimizationSurveyCreate
import io.healthplatform.pulsequery.api.models.QuickActionExecutionRequest
import io.healthplatform.pulsequery.api.models.RefreshTokenRequest
import io.healthplatform.pulsequery.api.models.ResetPasswordRequest
import io.healthplatform.pulsequery.api.models.SQLExecutionRequest
import io.healthplatform.pulsequery.api.models.SQLGenerationRequest
import io.healthplatform.pulsequery.api.models.ServiceUnitConstraint
import io.healthplatform.pulsequery.api.models.TemplateCreate
import io.healthplatform.pulsequery.api.models.TemplateUpdate
import io.healthplatform.pulsequery.api.models.TextConfig
import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.api.models.UserRoleUpdate
import io.healthplatform.pulsequery.api.models.UserStatusUpdate
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetReorderRequest
import io.healthplatform.pulsequery.api.models.WidgetUpdate
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.runResultPulseAsync
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

    /** Verifies [DashboardsApi] list and create request serialization and response deserialization. */
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

    /** Verifies [AnalyticsApi] query parameters and bearer token header forwarding. */
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

    /** Verifies [ChatApi] pagination query parameters and conversation list decoding. */
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

    /** Verifies [AdminApi], [TemplatesApi], [SchemaApi], [SystemApi], and [BenchmarksApi] endpoints. */
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

    /** Verifies [ExecutionApi] global filter body serialization and single-widget refresh. */
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

    /** Verifies [OptimizationApi] solve payload serialization and solution deserialization. */
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

    /** Verifies HTTP 400, 401, 403, 404, and 500 error responses map to [PulseQueryError.Http] subtypes. */
    @Test
    fun testHttpErrorResponses400And401And403And404And500() = runTest {
        val errorStatuses = listOf(
            HttpStatusCode.BadRequest to PulseQueryError.Http.BadRequest::class,
            HttpStatusCode.Unauthorized to PulseQueryError.Http.Unauthorized::class,
            HttpStatusCode.Forbidden to PulseQueryError.Http.Forbidden::class,
            HttpStatusCode.NotFound to PulseQueryError.Http.NotFound::class,
            HttpStatusCode.InternalServerError to PulseQueryError.Http.ServerError::class
        )

        for ((status, expectedErrorClass) in errorStatuses) {
            val engine = createInspectingMockEngine(
                forcedStatus = status,
                forcedErrorBody = """{"detail":"Error ${status.value}"}"""
            )
            // 1. Verify non-throwing .asResult() mapping into typed PulseQueryError.Http subtype
            val lenientClient = createMockClient(engine = engine, expectSuccess = false)
            val lenientApi = DashboardsApi(baseUrl = "http://localhost:8000", httpClient = lenientClient)
            val httpResponse = lenientApi.listDashboardsApiV1DashboardsGet()
            assertFalse(httpResponse.success, "Expected success=false for status ${status.value}")
            assertEquals(status.value, httpResponse.status)
            val mappedRes = httpResponse.asResult()
            assertTrue(mappedRes.isFailure)
            val pulseErr = mappedRes.exceptionOrNull()
            assertNotNull(pulseErr)
            assertTrue(expectedErrorClass.isInstance(pulseErr), "Expected $expectedErrorClass for ${status.value}")
            assertTrue(pulseErr.message.orEmpty().startsWith("HTTP ${status.value}: Error ${status.value}"))

            // 2. Verify runResultPulseAsync catches Ktor strict client exceptions into PulseQueryError
            val strictClient = createMockClient(engine = engine, expectSuccess = true)
            val strictApi = DashboardsApi(baseUrl = "http://localhost:8000", httpClient = strictClient)
            val caught = runResultPulseAsync {
                strictApi.listDashboardsApiV1DashboardsGet().asResult()
            }
            assertTrue(caught.isFailure, "Expected failure for status ${status.value}")
        }
    }

    /** Verifies [AnalyticsViewModel] state transitions on success and HTTP 500 error responses. */
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

    /** Exercises all constructors, endpoints, and optional parameter branches across all 15 OpenAPI services. */
    @Test
    fun testAllOpenApiServicesConstructorsAndBranches() = runTest {
        val engine = createInspectingMockEngine()
        val client = createMockClient(engine = engine)

        // Exercise default and explicit primary constructors on all 15 API classes
        assertEquals(ApiClient.BASE_URL, AdminApi().baseUrl)
        assertEquals("http://localhost:8000", AdminApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, AdminUsersApi().baseUrl)
        assertEquals("http://localhost:8000", AdminUsersApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, AiApi().baseUrl)
        assertEquals("http://localhost:8000", AiApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, AlertRulesApi().baseUrl)
        assertEquals("http://localhost:8000", AlertRulesApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, AnalyticsApi().baseUrl)
        assertEquals("http://localhost:8000", AnalyticsApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, AuthApi().baseUrl)
        assertEquals("http://localhost:8000", AuthApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, BenchmarksApi().baseUrl)
        assertEquals("http://localhost:8000", BenchmarksApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, ChatApi().baseUrl)
        assertEquals("http://localhost:8000", ChatApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, DashboardsApi().baseUrl)
        assertEquals("http://localhost:8000", DashboardsApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, DefaultApi().baseUrl)
        assertEquals("http://localhost:8000", DefaultApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, ExecutionApi().baseUrl)
        assertEquals("http://localhost:8000", ExecutionApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, OptimizationApi().baseUrl)
        assertEquals("http://localhost:8000", OptimizationApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, SchemaApi().baseUrl)
        assertEquals("http://localhost:8000", SchemaApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, SystemApi().baseUrl)
        assertEquals("http://localhost:8000", SystemApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)
        assertEquals(ApiClient.BASE_URL, TemplatesApi().baseUrl)
        assertEquals("http://localhost:8000", TemplatesApi("http://localhost:8000", engine, {}, ApiClient.JSON_DEFAULT).baseUrl)

        // 1. AdminApi
        val adminApi = AdminApi("http://localhost:8000", client)
        adminApi.readAdminSettingsApiV1AdminSettingsGet()
        adminApi.readAdminSettingsApiV1AdminSettingsGet(token = "t", acceptLanguage = "es")
        val settingsUpdate = AdminSettingsUpdateRequest(apiKeys = emptyMap(), visibleModels = emptyList())
        adminApi.writeAdminSettingsApiV1AdminSettingsPut(settingsUpdate)
        adminApi.writeAdminSettingsApiV1AdminSettingsPut(settingsUpdate, token = "t", acceptLanguage = "es")

        // 2. AdminUsersApi
        val adminUsersApi = AdminUsersApi("http://localhost:8000", client)
        adminUsersApi.listUsersApiV1AdminUsersGet()
        adminUsersApi.listUsersApiV1AdminUsersGet(limit = null, offset = null, role = null, search = null, token = null, acceptLanguage = null)
        adminUsersApi.listUsersApiV1AdminUsersGet(limit = 10, offset = 0, role = "ADMIN", search = "doc", token = "t", acceptLanguage = "es")
        adminUsersApi.listUsersApiV1AdminUsersGet_0()
        adminUsersApi.listUsersApiV1AdminUsersGet_0(limit = null, offset = null, role = null, search = null, token = null, acceptLanguage = null)
        adminUsersApi.listUsersApiV1AdminUsersGet_0(limit = 10, offset = 0, role = "ADMIN", search = "doc", token = "t", acceptLanguage = "es")
        adminUsersApi.updateUserRoleApiV1AdminUsersUserIdRolePut("u1", UserRoleUpdate(role = "ADMIN"))
        adminUsersApi.updateUserRoleApiV1AdminUsersUserIdRolePut("u1", UserRoleUpdate(role = "ADMIN"), token = "t", acceptLanguage = "es")
        adminUsersApi.updateUserStatusApiV1AdminUsersUserIdStatusPut("u1", UserStatusUpdate(isActive = true))
        adminUsersApi.updateUserStatusApiV1AdminUsersUserIdStatusPut("u1", UserStatusUpdate(isActive = false), token = "t", acceptLanguage = "es")

        // 3. AiApi
        val aiApi = AiApi("http://localhost:8000", client)
        aiApi.executeSqlPreviewApiV1AiExecutePost(SQLExecutionRequest(sql = "SELECT 1"))
        aiApi.executeSqlPreviewApiV1AiExecutePost(SQLExecutionRequest(sql = "SELECT 1"), token = "t")
        aiApi.generateSqlComparisonApiV1AiGeneratePost(SQLGenerationRequest(prompt = "count"))
        aiApi.generateSqlComparisonApiV1AiGeneratePost(SQLGenerationRequest(prompt = "count"), token = "t")
        aiApi.listAvailableModelsApiV1AiModelsGet()
        aiApi.listAvailableModelsApiV1AiModelsGet(showAll = null, token = null, includeSql = null, discoverOllama = null)
        aiApi.listAvailableModelsApiV1AiModelsGet(showAll = true, token = "t", includeSql = true, discoverOllama = true)

        // 4. AlertRulesApi
        val alertRulesApi = AlertRulesApi("http://localhost:8000", client)
        val ruleCreate = AlertRuleCreate(unitCategory = "ICU", thresholdPercentage = 90.0)
        alertRulesApi.createAlertRuleApiV1AnalyticsAlertRulesPost(ruleCreate)
        alertRulesApi.createAlertRuleApiV1AnalyticsAlertRulesPost(ruleCreate, token = "t")
        alertRulesApi.createAlertRuleApiV1AnalyticsAlertRulesPost_0(ruleCreate)
        alertRulesApi.createAlertRuleApiV1AnalyticsAlertRulesPost_0(ruleCreate, token = "t")
        alertRulesApi.deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete("r1")
        alertRulesApi.deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete("r1", token = "t")
        alertRulesApi.getAlertRuleApiV1AnalyticsAlertRulesRuleIdGet("r1")
        alertRulesApi.getAlertRuleApiV1AnalyticsAlertRulesRuleIdGet("r1", token = "t")
        alertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet()
        alertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet(token = "t")
        alertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet_0()
        alertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet_0(token = "t")
        alertRulesApi.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut("r1", AlertRuleUpdate(isActive = true))
        alertRulesApi.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut("r1", AlertRuleUpdate(isActive = true), token = "t")

        // 5. AnalyticsApi
        val analyticsApi = AnalyticsApi("http://localhost:8000", client)
        analyticsApi.getCapacityAlertsApiV1AnalyticsAlertsGet()
        analyticsApi.getCapacityAlertsApiV1AnalyticsAlertsGet(token = "t")
        analyticsApi.listLlmOutputsApiV1AnalyticsLlmGet()
        analyticsApi.listLlmOutputsApiV1AnalyticsLlmGet(limit = null, offset = null, token = null)
        analyticsApi.listLlmOutputsApiV1AnalyticsLlmGet(limit = 5, offset = 1, token = "t")

        // 6. AuthApi
        val authApi = AuthApi("http://localhost:8000", client)
        authApi.forgotPasswordApiV1AuthForgotPasswordPost(ForgotPasswordRequest(email = "a@b.com"))
        authApi.loginAccessTokenApiV1AuthLoginPost(username = "a@b.com", password = "pw")
        authApi.loginAccessTokenApiV1AuthLoginPost(
            username = "a@b.com",
            password = "pw",
            acceptLanguage = null,
            grantType = null,
            scope = null,
            clientId = null,
            clientSecret = null
        )
        authApi.loginAccessTokenApiV1AuthLoginPost(
            username = "a@b.com",
            password = "pw",
            acceptLanguage = "es",
            grantType = "password",
            scope = "read",
            clientId = "cid",
            clientSecret = "csec"
        )
        authApi.readUsersMeApiV1AuthMeGet()
        authApi.readUsersMeApiV1AuthMeGet(token = "t")
        authApi.refreshAccessTokenApiV1AuthRefreshPost(RefreshTokenRequest(refreshToken = "rt"))
        authApi.registerUserApiV1AuthRegisterPost(UserCreate(email = "a@b.com", password = "pw"))
        authApi.registerUserApiV1AuthRegisterPost(UserCreate(email = "a@b.com", password = "pw"), acceptLanguage = "es")
        authApi.resetPasswordApiV1AuthResetPasswordPost(ResetPasswordRequest(token = "rt", newPassword = "npw"))
        authApi.revokeSessionApiV1AuthRevokePost(RefreshTokenRequest(refreshToken = "rt"))

        // 7. BenchmarksApi
        val benchmarksApi = BenchmarksApi("http://localhost:8000", client)
        benchmarksApi.getOptimizationBenchmarksApiV1BenchmarksOptimizationGet()
        benchmarksApi.getSqlBenchmarksApiV1BenchmarksSqlGet()

        // 8. ChatApi
        val chatApi = ChatApi("http://localhost:8000", client)
        val convCreate = ConversationCreate(title = "T")
        chatApi.createConversationApiV1ChatPost(convCreate)
        chatApi.createConversationApiV1ChatPost(convCreate, token = "t")
        chatApi.createConversationApiV1ConversationsPost(convCreate)
        chatApi.createConversationApiV1ConversationsPost(convCreate, token = "t")
        chatApi.deleteConversationApiV1ChatConversationIdDelete("c1")
        chatApi.deleteConversationApiV1ChatConversationIdDelete("c1", token = "t")
        chatApi.deleteConversationApiV1ConversationsConversationIdDelete("c1")
        chatApi.deleteConversationApiV1ConversationsConversationIdDelete("c1", token = "t")
        chatApi.getMessagesApiV1ChatConversationIdMessagesGet("c1")
        chatApi.getMessagesApiV1ChatConversationIdMessagesGet("c1", token = "t")
        chatApi.getMessagesApiV1ConversationsConversationIdMessagesGet("c1")
        chatApi.getMessagesApiV1ConversationsConversationIdMessagesGet("c1", token = "t")
        chatApi.listConversationsApiV1ChatGet()
        chatApi.listConversationsApiV1ChatGet(limit = null, offset = null, token = null)
        chatApi.listConversationsApiV1ChatGet(limit = 10, offset = 0, token = "t")
        chatApi.listConversationsApiV1ConversationsGet()
        chatApi.listConversationsApiV1ConversationsGet(limit = null, offset = null, token = null)
        chatApi.listConversationsApiV1ConversationsGet(limit = 10, offset = 0, token = "t")
        val msgCreate = MessageCreate(content = "hi")
        chatApi.sendMessageApiV1ChatConversationIdMessagesPost("c1", msgCreate)
        chatApi.sendMessageApiV1ChatConversationIdMessagesPost("c1", msgCreate, token = "t")
        chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost("c1", msgCreate)
        chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost("c1", msgCreate, token = "t")
        chatApi.streamConversationTokensApiV1ChatStreamConversationIdGet("c1")
        chatApi.streamConversationTokensApiV1ChatStreamConversationIdGet("c1", modelId = "gpt-4o", token = "t")
        chatApi.streamConversationTokensApiV1ConversationsStreamConversationIdGet("c1")
        chatApi.streamConversationTokensApiV1ConversationsStreamConversationIdGet("c1", modelId = "gpt-4o", token = "t")
        val convUpdate = ConversationUpdate(title = "T2")
        chatApi.updateConversationApiV1ChatConversationIdPut("c1", convUpdate)
        chatApi.updateConversationApiV1ChatConversationIdPut("c1", convUpdate, token = "t")
        chatApi.updateConversationApiV1ConversationsConversationIdPut("c1", convUpdate)
        chatApi.updateConversationApiV1ConversationsConversationIdPut("c1", convUpdate, token = "t")
        val voteReq = MessageVoteRequest(candidateId = "cand1")
        chatApi.voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost("c1", "m1", voteReq)
        chatApi.voteCandidateApiV1ChatConversationIdMessagesMessageIdVotePost("c1", "m1", voteReq, token = "t")
        chatApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost("c1", "m1", voteReq)
        chatApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost("c1", "m1", voteReq, token = "t")

        // 9. DashboardsApi
        val dashboardsApi = DashboardsApi("http://localhost:8000", client)
        dashboardsApi.cloneDashboardApiV1DashboardsDashboardIdClonePost("d1")
        dashboardsApi.cloneDashboardApiV1DashboardsDashboardIdClonePost("d1", token = "t", acceptLanguage = "es")
        dashboardsApi.createDashboardApiV1DashboardsPost(DashboardCreate(name = "D"))
        dashboardsApi.createDashboardApiV1DashboardsPost(DashboardCreate(name = "D"), token = "t")
        val widgetIn = WidgetIn.Text(title = "W", config = TextConfig(content = "c"))
        dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost("d1", widgetIn)
        dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost("d1", widgetIn, token = "t", acceptLanguage = "es")
        dashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete("d1")
        dashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete("d1", token = "t", acceptLanguage = "es")
        dashboardsApi.deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete("d1", "s1")
        dashboardsApi.deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete("d1", "s1", token = "t", acceptLanguage = "es")
        dashboardsApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete("w1")
        dashboardsApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete("w1", token = "t", acceptLanguage = "es")
        dashboardsApi.exportDashboardApiV1DashboardsDashboardIdExportGet("d1")
        dashboardsApi.exportDashboardApiV1DashboardsDashboardIdExportGet("d1", format = null, token = null, acceptLanguage = null)
        dashboardsApi.exportDashboardApiV1DashboardsDashboardIdExportGet("d1", format = "csv", token = "t", acceptLanguage = "es")
        dashboardsApi.exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet("d1")
        dashboardsApi.exportDashboardPdfApiV1DashboardsDashboardIdExportPdfGet("d1", token = "t", acceptLanguage = "es")
        dashboardsApi.exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet("d1", "w1")
        dashboardsApi.exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet("d1", "w1", format = null, token = null, acceptLanguage = null)
        dashboardsApi.exportWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdExportGet("d1", "w1", format = "csv", token = "t", acceptLanguage = "es")
        dashboardsApi.getDashboardApiV1DashboardsDashboardIdGet("d1")
        dashboardsApi.getDashboardApiV1DashboardsDashboardIdGet("d1", token = "t", acceptLanguage = "es")
        dashboardsApi.listDashboardSharesApiV1DashboardsDashboardIdSharesGet("d1")
        dashboardsApi.listDashboardSharesApiV1DashboardsDashboardIdSharesGet("d1", token = "t", acceptLanguage = "es")
        dashboardsApi.listDashboardsApiV1DashboardsGet()
        dashboardsApi.listDashboardsApiV1DashboardsGet(token = "t")
        dashboardsApi.listDashboardsApiV1DashboardsGet_0()
        dashboardsApi.listDashboardsApiV1DashboardsGet_0(token = "t")
        dashboardsApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost("d1", WidgetReorderRequest(items = emptyList()))
        dashboardsApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost("d1", WidgetReorderRequest(items = emptyList()), token = "t", acceptLanguage = "es")
        dashboardsApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost()
        dashboardsApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost(token = "t")
        dashboardsApi.shareDashboardApiV1DashboardsDashboardIdSharesPost("d1", DashboardShareCreate(userEmail = "u@h.org"))
        dashboardsApi.shareDashboardApiV1DashboardsDashboardIdSharesPost("d1", DashboardShareCreate(userEmail = "u@h.org"), token = "t", acceptLanguage = "es")
        dashboardsApi.updateDashboardApiV1DashboardsDashboardIdPut("d1", DashboardCreate(name = "D2"))
        dashboardsApi.updateDashboardApiV1DashboardsDashboardIdPut("d1", DashboardCreate(name = "D2"), token = "t", acceptLanguage = "es")
        dashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut("w1", WidgetUpdate(title = "W2"))
        dashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut("w1", WidgetUpdate(title = "W2"), token = "t", acceptLanguage = "es")

        // 10. DefaultApi
        val defaultApi = DefaultApi("http://localhost:8000", client)
        defaultApi.rootGet()

        // 11. ExecutionApi
        val executionApi = ExecutionApi("http://localhost:8000", client)
        executionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost("d1")
        executionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
            dashboardId = "d1",
            token = "t",
            authorization = "Bearer x",
            acceptLanguage = "es",
            requestBody = mapOf("k" to JsonPrimitive("v"))
        )
        executionApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost("d1", "w1")
        executionApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
            dashboardId = "d1",
            widgetId = "w1",
            forceRefresh = null,
            token = null,
            authorization = null,
            acceptLanguage = null,
            naturalText = null,
            processor = null
        )
        executionApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
            dashboardId = "d1",
            widgetId = "w1",
            forceRefresh = true,
            token = "t",
            authorization = "Bearer x",
            acceptLanguage = "es",
            naturalText = "count",
            processor = "SQL"
        )

        // 12. OptimizationApi
        val optApi = OptimizationApi("http://localhost:8000", client)
        optApi.createOptimizationSessionApiV1OptimizationSessionsPost(OptimizationSessionCreate())
        optApi.createOptimizationSessionApiV1OptimizationSessionsPost(OptimizationSessionCreate(), token = "t")
        optApi.deleteOptimizationSessionApiV1OptimizationSessionsSessionIdDelete("s1")
        optApi.deleteOptimizationSessionApiV1OptimizationSessionsSessionIdDelete("s1", token = "t")
        optApi.executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost("a1", QuickActionExecutionRequest())
        optApi.executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost("a1", QuickActionExecutionRequest(), token = "t")
        optApi.getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet()
        optApi.getOptimizationEvaluationSummaryApiV1OptimizationSurveysSummaryGet(token = "t")
        optApi.getOptimizationInstitutionsApiV1OptimizationInstitutionsGet()
        optApi.getOptimizationInstitutionsApiV1OptimizationInstitutionsGet(token = "t")
        optApi.getOptimizationModelCompendiumApiV1OptimizationModelsGet()
        optApi.getOptimizationModelCompendiumApiV1OptimizationModelsGet(token = "t")
        optApi.getOptimizationQuickActionsApiV1OptimizationQuickActionsGet()
        optApi.getOptimizationQuickActionsApiV1OptimizationQuickActionsGet(useCase = "service_unit", token = "t")
        optApi.getOptimizationSessionApiV1OptimizationSessionsSessionIdGet("s1")
        optApi.getOptimizationSessionApiV1OptimizationSessionsSessionIdGet("s1", token = "t")
        optApi.iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost("s1", OptimizationIterationRequest(prompt = "p"))
        optApi.iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost("s1", OptimizationIterationRequest(prompt = "p"), token = "t")
        optApi.listOptimizationSessionsApiV1OptimizationSessionsGet()
        optApi.listOptimizationSessionsApiV1OptimizationSessionsGet(token = "t")
        val solveReq = OptimizationSolveRequest(prompt = "p")
        optApi.solveOptimizationStatelessApiV1OptimizationSolvePost(solveReq)
        optApi.solveOptimizationStatelessApiV1OptimizationSolvePost(solveReq, token = "t")
        val surveyReq = OptimizationSurveyCreate(scoreVsManualProcess = 5, scoreVsOtherWorkflowTech = 5, interpretabilityScore = 5)
        optApi.submitOptimizationSurveyApiV1OptimizationSurveysPost(surveyReq)
        optApi.submitOptimizationSurveyApiV1OptimizationSurveysPost(surveyReq, token = "t")

        // 13. SchemaApi
        val schemaApi = SchemaApi("http://localhost:8000", client)
        schemaApi.getDatabaseSchemaApiV1SchemaGet()
        schemaApi.getDatabaseSchemaApiV1SchemaGet(token = "t")

        // 14. SystemApi
        val systemApi = SystemApi("http://localhost:8000", client)
        systemApi.getSystemDiagnosticsApiV1SystemDiagnosticsGet()
        systemApi.getSystemDiagnosticsApiV1SystemDiagnosticsGet(token = "t")
        systemApi.getSystemHealthApiV1SystemHealthGet()
        systemApi.getSystemHealthApiV1SystemHealthGet(strict = null)
        systemApi.getSystemHealthApiV1SystemHealthGet(strict = true)
        systemApi.triggerReingestApiV1SystemReingestPost()
        systemApi.triggerReingestApiV1SystemReingestPost(token = "t", acceptLanguage = "es")

        // 15. TemplatesApi
        val templatesApi = TemplatesApi("http://localhost:8000", client)
        val tplCreate = TemplateCreate(title = "T", sqlTemplate = "SELECT 1", category = "C")
        templatesApi.createTemplateApiV1TemplatesPost(tplCreate)
        templatesApi.createTemplateApiV1TemplatesPost(tplCreate, token = "t")
        templatesApi.deleteTemplateApiV1TemplatesTemplateIdDelete("t1")
        templatesApi.deleteTemplateApiV1TemplatesTemplateIdDelete("t1", token = "t")
        templatesApi.getTemplateApiV1TemplatesTemplateIdGet("t1")
        templatesApi.getTemplateApiV1TemplatesTemplateIdGet("t1", token = "t")
        templatesApi.listTemplatesApiV1TemplatesGet()
        templatesApi.listTemplatesApiV1TemplatesGet(category = null, search = null, limit = null, token = null)
        templatesApi.listTemplatesApiV1TemplatesGet(category = "C", search = "s", limit = 10, token = "t")
        templatesApi.updateTemplateApiV1TemplatesTemplateIdPut("t1", TemplateUpdate(title = "T2"))
        templatesApi.updateTemplateApiV1TemplatesTemplateIdPut("t1", TemplateUpdate(title = "T2"), token = "t")
    }
}
