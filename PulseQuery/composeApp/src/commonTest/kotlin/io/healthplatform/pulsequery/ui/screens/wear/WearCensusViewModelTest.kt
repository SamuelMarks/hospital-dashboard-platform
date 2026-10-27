package io.healthplatform.pulsequery.ui.screens.wear

import io.healthplatform.pulsequery.api.apis.AlertRulesApi
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
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [WearCensusViewModel] and [WearCensusUiState].
 */
class WearCensusViewModelTest {

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
    fun testWearCensusUiStateProperties() {
        val state = WearCensusUiState(
            alerts = emptyList(),
            occupancyPercent = 91,
            openBeds = 18,
            isLoading = false,
            errorMessage = "err"
        )
        assertTrue(state.alerts.isEmpty())
        assertEquals(91, state.occupancyPercent)
        assertEquals(18, state.openBeds)
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testLoadWearDataSuccessDefaultAndExplicit() = runTest {
        val jsonPayload = """
            [
                {
                    "id": "r1",
                    "unit_category": "ICU",
                    "threshold_percentage": 90.0,
                    "severity": "CRITICAL",
                    "is_active": true,
                    "created_by_user_id": "u1",
                    "created_at": "2026-01-01T00:00:00Z",
                    "updated_at": "2026-01-01T00:00:00Z"
                }
            ]
        """.trimIndent()
        val engine = MockEngine {
            respond(
                content = jsonPayload,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = createClient(engine)
        AppContainer.setHttpClientForTest(client)

        val vmDefault = WearCensusViewModel(scope = this)
        vmDefault.loadWearData()
        val state1 = vmDefault.state.first { !it.isLoading }
        assertEquals(1, state1.alerts.size)
        assertEquals("ICU", state1.alerts[0].unitCategory)
        assertNull(state1.errorMessage)

        val explicitApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = client)
        val vmExplicit = WearCensusViewModel(scope = this, alertRulesApi = explicitApi)
        vmExplicit.loadWearData()
        val state2 = vmExplicit.state.first { !it.isLoading }
        assertEquals(1, state2.alerts.size)
    }

    @Test
    fun testLoadWearDataFailureWithAndWithoutMessage() = runTest {
        val engineWithMsg = MockEngine {
            throw IllegalStateException("Wearable sync error")
        }
        val api1 = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineWithMsg))
        val vm1 = WearCensusViewModel(scope = this, alertRulesApi = api1)
        vm1.loadWearData()
        val state1 = vm1.state.first { !it.isLoading }
        assertEquals("Wearable sync error", state1.errorMessage)

        val engineNullMsg = MockEngine {
            throw RuntimeException(null as String?)
        }
        val api2 = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineNullMsg))
        val vm2 = WearCensusViewModel(scope = this, alertRulesApi = api2)
        vm2.loadWearData()
        val state2 = vm2.state.first { !it.isLoading }
        assertEquals("Failed to load wearable census alerts", state2.errorMessage)
    }
}
