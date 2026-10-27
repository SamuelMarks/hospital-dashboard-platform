package io.healthplatform.pulsequery.ui.screens.editor

import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.QueryCartRepository
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
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [EditorViewModel] and [EditorUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class EditorViewModelTest {

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
    fun testEditorUiStateProperties() {
        val state = EditorUiState(sqlQuery = "SELECT 1", result = null, isLoading = false, errorMessage = "err")
        assertEquals("SELECT 1", state.sqlQuery)
        assertNull(state.result)
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testUpdateSqlQueryAndStageToCart() = kotlinx.coroutines.runBlocking {
        val cart = QueryCartRepository()
        val vm = EditorViewModel(scope = this, queryCartRepository = cart)

        vm.updateSqlQuery("   ")
        assertEquals("   ", vm.state.value.sqlQuery)
        vm.stageToCart()
        assertTrue(cart.stagedQueries.value.isEmpty())

        vm.updateSqlQuery("SELECT count(*) FROM admissions;")
        vm.stageToCart("Admissions Count")
        assertEquals(1, cart.stagedQueries.value.size)
        assertEquals("Admissions Count", cart.stagedQueries.value[0].title)
        assertEquals("SELECT count(*) FROM admissions;", cart.stagedQueries.value[0].sql)

        // Default title
        vm.stageToCart()
        assertEquals(2, cart.stagedQueries.value.size)
        assertEquals("Editor Query", cart.stagedQueries.value[1].title)
    }

    @Test
    fun testExecuteSqlBlankAndSuccessDefaultAndExplicit(): Unit = kotlinx.coroutines.runBlocking {
        val responseJson = """
            {
                "data": [{"cnt": 42}],
                "columns": ["cnt"],
                "error": null
            }
        """.trimIndent()
        var callCount = 0
        val engine = MockEngine {
            callCount++
            respond(
                content = responseJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = createClient(engine)
        AppContainer.setHttpClientForTest(client)

        val vmDefault = EditorViewModel(scope = this)
        // Blank query is ignored
        vmDefault.updateSqlQuery("   ")
        vmDefault.executeSql()
        kotlinx.coroutines.delay(50)
        assertEquals(0, callCount)

        // Non-blank query succeeds using default AppContainer.aiApi
        vmDefault.updateSqlQuery("SELECT count(*) AS cnt FROM admissions;")
        vmDefault.executeSql()
        kotlinx.coroutines.withTimeout(5000) {
            while (vmDefault.state.value.result == null) {
                kotlinx.coroutines.delay(10)
            }
        }
        assertEquals(1, callCount)
        assertNotNull(vmDefault.state.value.result)
        assertEquals(listOf("cnt"), vmDefault.state.value.result?.columns)
        assertFalse(vmDefault.state.value.isLoading)
        assertNull(vmDefault.state.value.errorMessage)

        // Explicit aiApi
        val explicitApi = AiApi(baseUrl = "http://localhost", httpClient = client)
        val vmExplicit = EditorViewModel(scope = this, aiApi = explicitApi)
        vmExplicit.executeSql()
        kotlinx.coroutines.withTimeout(5000) {
            while (vmExplicit.state.value.result == null) {
                kotlinx.coroutines.delay(10)
            }
        }
        assertEquals(2, callCount)
        assertNotNull(vmExplicit.state.value.result)
    }

    @Test
    fun testExecuteSqlFailureWithAndWithoutMessage() = kotlinx.coroutines.runBlocking {
        val engineWithMsg = MockEngine {
            throw IllegalStateException("DuckDB syntax error")
        }
        val api1 = AiApi(baseUrl = "http://localhost", httpClient = createClient(engineWithMsg))
        val vm1 = EditorViewModel(scope = this, aiApi = api1)
        vm1.executeSql("SQL Error: ")
        kotlinx.coroutines.delay(50)
        assertEquals("SQL Error: DuckDB syntax error", vm1.state.value.errorMessage)
        assertFalse(vm1.state.value.isLoading)

        val engineNullMsg = MockEngine {
            throw RuntimeException(null as String?)
        }
        val api2 = AiApi(baseUrl = "http://localhost", httpClient = createClient(engineNullMsg))
        val vm2 = EditorViewModel(scope = this, aiApi = api2)
        vm2.executeSql()
        kotlinx.coroutines.delay(50)
        assertEquals("Execution failed: Unknown error", vm2.state.value.errorMessage)
    }

    @Test
    fun testLoadAvailableDashboardsAndSaveQuery() = kotlinx.coroutines.runBlocking {
        val engine = MockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.endsWith("/dashboards") -> respond(
                    content = """[{"id":"d1","name":"ICU Dashboard","owner_id":"u1","widgets":[]}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/widgets") -> respond(
                    content = """{"id":"w1","dashboard_id":"d1","title":"Saved Widget","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/templates") -> respond(
                    content = """{"id":"t1","title":"Saved Template","sql_template":"SELECT 1","category":"Clinical"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond("", HttpStatusCode.NotFound)
            }
        }
        val client = createClient(engine)
        AppContainer.setHttpClientForTest(client)

        // Default APIs via AppContainer
        val vmDefault = EditorViewModel(scope = this)
        val dashRes = vmDefault.loadAvailableDashboards()
        assertTrue(dashRes.isSuccess)
        assertEquals(1, dashRes.getOrThrow().size)

        val saveWidgetRes = vmDefault.saveQuery(
            destination = SaveQueryDestination.DASHBOARD_WIDGET,
            title = "Saved Widget",
            sql = "SELECT 1",
            dashboardId = "d1"
        )
        assertTrue(saveWidgetRes.isSuccess)
        assertEquals("Widget successfully added to dashboard", saveWidgetRes.getOrThrow())

        val saveTemplateRes = vmDefault.saveQuery(
            destination = SaveQueryDestination.TEMPLATE,
            title = "Saved Template",
            sql = "SELECT 1",
            dashboardId = null,
            category = "   ",
            description = "Desc"
        )
        assertTrue(saveTemplateRes.isSuccess)
        assertEquals("Template successfully registered in library", saveTemplateRes.getOrThrow())

        // Fallback to TEMPLATE when destination is DASHBOARD_WIDGET but dashboardId is null, with explicit APIs
        val explicitDashApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(baseUrl = "http://localhost", httpClient = client)
        val explicitTmplApi = io.healthplatform.pulsequery.api.apis.TemplatesApi(baseUrl = "http://localhost", httpClient = client)
        val vmExplicit = EditorViewModel(
            scope = this,
            dashboardsApi = explicitDashApi,
            templatesApi = explicitTmplApi
        )
        assertTrue(vmExplicit.loadAvailableDashboards().isSuccess)
        val saveExplicitWidget = vmExplicit.saveQuery(
            destination = SaveQueryDestination.DASHBOARD_WIDGET,
            title = "Explicit Widget",
            sql = "SELECT 1",
            dashboardId = "d1",
            visualization = "bar_chart"
        )
        assertTrue(saveExplicitWidget.isSuccess)

        val saveFallbackTemplate = vmExplicit.saveQuery(
            destination = SaveQueryDestination.DASHBOARD_WIDGET,
            title = "Fallback Template",
            sql = "SELECT 1",
            dashboardId = null,
            category = "ICU",
            description = "Desc"
        )
        assertTrue(saveFallbackTemplate.isSuccess)

        val failEngine = MockEngine { throw IllegalStateException("Network down") }
        val failClient = createClient(failEngine)
        val vmFail = EditorViewModel(
            scope = this,
            dashboardsApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(baseUrl = "http://localhost", httpClient = failClient),
            templatesApi = io.healthplatform.pulsequery.api.apis.TemplatesApi(baseUrl = "http://localhost", httpClient = failClient)
        )
        assertTrue(vmFail.loadAvailableDashboards().isFailure)
        assertTrue(
            vmFail.saveQuery(
                destination = SaveQueryDestination.DASHBOARD_WIDGET,
                title = "W",
                sql = "SELECT 1",
                dashboardId = "d1"
            ).isFailure
        )
        assertTrue(
            vmFail.saveQuery(
                destination = SaveQueryDestination.TEMPLATE,
                title = "T",
                sql = "SELECT 1",
                dashboardId = null
            ).isFailure
        )
    }
}
