package io.healthplatform.pulsequery.api

import io.healthplatform.pulsequery.api.apis.*
import io.healthplatform.pulsequery.mockEngine
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests verifying KMP API client endpoints against mock HTTP responses.
 */
class ApiTests {

    @Test
    fun testDashboardsApi() = runTest {
        val api = DashboardsApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.listDashboardsApiV1DashboardsGet()
        assertNotNull(response.body())
        assertTrue(response.body().isNotEmpty())
    }

    @Test
    fun testAnalyticsApi() = runTest {
        val api = AnalyticsApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.listLlmOutputsApiV1AnalyticsLlmGet()
        assertNotNull(response.body())
    }

    @Test
    fun testChatApi() = runTest {
        val api = ChatApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.listConversationsApiV1ConversationsGet()
        assertNotNull(response.body())
    }

    @Test
    fun testAdminApi() = runTest {
        val api = AdminApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.readAdminSettingsApiV1AdminSettingsGet()
        assertNotNull(response.body())
    }

    @Test
    fun testTemplatesApi() = runTest {
        val api = TemplatesApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.listTemplatesApiV1TemplatesGet()
        assertNotNull(response.body())
    }

    @Test
    fun testSchemaApi() = runTest {
        val api = SchemaApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.getDatabaseSchemaApiV1SchemaGet()
        assertNotNull(response.body())
    }

    @Test
    fun testExecutionApi() = runTest {
        val api = ExecutionApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(dashboardId = "1")
        assertNotNull(response.body())
        val widgetResponse = api.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(dashboardId = "1", widgetId = "1")
        assertNotNull(widgetResponse.body())
    }

    @Test
    fun testSimulationApi() = runTest {
        val api = SimulationApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val request = io.healthplatform.pulsequery.api.models.ScenarioRunRequest(
            demandSourceSql = "SELECT service, count FROM demand",
            capacityParameters = mapOf("ICU" to 20.0)
        )
        val response = api.runSimulationApiV1SimulationRunPost(request)
        assertNotNull(response.body())
        kotlin.test.assertEquals("optimal", response.body().status)
    }

    @Test
    fun testSystemApi() = runTest {
        val api = SystemApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val response = api.getSystemHealthApiV1SystemHealthGet()
        assertNotNull(response.body())
    }

    @Test
    fun testBenchmarksApi() = runTest {
        val api = BenchmarksApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val sqlRes = api.getSqlBenchmarksApiV1BenchmarksSqlGet()
        assertNotNull(sqlRes.body())
        val mpaxRes = api.getMpaxBenchmarksApiV1BenchmarksMpaxGet()
        assertNotNull(mpaxRes.body())
    }

    @Test
    fun testMpaxArenaApi() = runTest {
        val api = MpaxArenaApi(baseUrl = "http://localhost:8000", httpClientEngine = mockEngine)
        val req = io.healthplatform.pulsequery.api.models.MpaxArenaRequest(
            prompt = "Optimize ICU bed allocation",
            mode = "critic"
        )
        val response = api.runMpaxArenaModeApiV1MpaxArenaRunPost(req)
        assertNotNull(response.body())
        kotlin.test.assertEquals("critic", response.body().mode)
    }
}
