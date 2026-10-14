package io.healthplatform.pulsequery.ui.screens.tv

import io.healthplatform.pulsequery.api.apis.DashboardsApi
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Comprehensive unit tests for [TvDashboardViewModel] and [TvDashboardUiState].
 */
class TvDashboardViewModelTest {

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
    fun testTvDashboardUiStateProperties() {
        val state = TvDashboardUiState(activeDashboard = null, isLoading = false, errorMessage = "err")
        assertNull(state.activeDashboard)
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testLoadDashboardSuccessNonEmptyAndEmpty() = runTest {
        val engineNonEmpty = MockEngine {
            respond(
                content = """[{"id":"d1","name":"TV Main","owner_id":"u1","widgets":[]}]""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val clientNonEmpty = createClient(engineNonEmpty)
        AppContainer.setHttpClientForTest(clientNonEmpty)

        // Default api (via AppContainer)
        val vmDefault = TvDashboardViewModel(scope = this)
        vmDefault.loadDashboard()
        val state1 = vmDefault.state.first { !it.isLoading }
        assertNotNull(state1.activeDashboard)
        assertEquals("TV Main", state1.activeDashboard.name)
        assertNull(state1.errorMessage)

        // Explicit api with empty list
        val engineEmpty = MockEngine {
            respond(
                content = "[]",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val explicitApi = DashboardsApi(baseUrl = "http://localhost", httpClient = createClient(engineEmpty))
        val vmEmpty = TvDashboardViewModel(scope = this, dashboardsApi = explicitApi)
        vmEmpty.loadDashboard()
        val state2 = vmEmpty.state.first { !it.isLoading }
        assertNull(state2.activeDashboard)
        assertNull(state2.errorMessage)
    }

    @Test
    fun testLoadDashboardFailureWithAndWithoutMessage() = runTest {
        val engineWithMsg = MockEngine {
            throw IllegalStateException("TV API offline")
        }
        val api1 = DashboardsApi(baseUrl = "http://localhost", httpClient = createClient(engineWithMsg))
        val vm1 = TvDashboardViewModel(scope = this, dashboardsApi = api1)
        vm1.loadDashboard()
        val state1 = vm1.state.first { !it.isLoading }
        assertEquals("TV API offline", state1.errorMessage)

        val engineNullMsg = MockEngine {
            throw RuntimeException(null as String?)
        }
        val api2 = DashboardsApi(baseUrl = "http://localhost", httpClient = createClient(engineNullMsg))
        val vm2 = TvDashboardViewModel(scope = this, dashboardsApi = api2)
        vm2.loadDashboard()
        val state2 = vm2.state.first { !it.isLoading }
        assertEquals("Failed to load TV dashboard", state2.errorMessage)
    }
}
