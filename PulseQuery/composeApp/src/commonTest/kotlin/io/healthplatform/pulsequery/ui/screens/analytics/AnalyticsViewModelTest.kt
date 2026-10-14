package io.healthplatform.pulsequery.ui.screens.analytics

import io.healthplatform.pulsequery.api.apis.AnalyticsApi
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
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [AnalyticsViewModel] and [AnalyticsUiState].
 */
class AnalyticsViewModelTest {

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
    fun testAnalyticsUiStateProperties() {
        val state = AnalyticsUiState(records = emptyList(), isLoading = false, errorMessage = "err")
        assertTrue(state.records.isEmpty())
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testLoadAnalyticsSuccessWithDefaultAndExplicitApi() = runTest {
        val jsonPayload = """
            [
                {
                    "source": "chat",
                    "candidate_id": "cand-1",
                    "user_id": "u-1",
                    "user_email": "clinician@hospital.org",
                    "llm": "gpt-4o",
                    "is_selected": true,
                    "created_at": "2026-09-14T10:00:00Z"
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

        // Default api (via AppContainer)
        val vmDefault = AnalyticsViewModel(scope = this)
        vmDefault.loadAnalytics()
        val state1 = vmDefault.state.first { !it.isLoading }
        assertEquals(1, state1.records.size)
        assertEquals("gpt-4o", state1.records[0].llm)
        assertNull(state1.errorMessage)

        // Explicit api
        val explicitApi = AnalyticsApi(baseUrl = "http://localhost", httpClient = client)
        val vmExplicit = AnalyticsViewModel(scope = this, analyticsApi = explicitApi)
        vmExplicit.loadAnalytics()
        val state2 = vmExplicit.state.first { !it.isLoading }
        assertEquals(1, state2.records.size)
    }

    @Test
    fun testLoadAnalyticsFailureWithAndWithoutMessage() = runTest {
        // 1. Failure with exception message
        val engineWithMsg = MockEngine {
            throw IllegalStateException("Backend analytics down")
        }
        val apiWithMsg = AnalyticsApi(baseUrl = "http://localhost", httpClient = createClient(engineWithMsg))
        val vmWithMsg = AnalyticsViewModel(scope = this, analyticsApi = apiWithMsg)
        vmWithMsg.loadAnalytics()
        val state1 = vmWithMsg.state.first { !it.isLoading }
        assertEquals("Backend analytics down", state1.errorMessage)

        // 2. Failure with null exception message uses fallbackError
        val engineNullMsg = MockEngine {
            throw RuntimeException(null as String?)
        }
        val apiNullMsg = AnalyticsApi(baseUrl = "http://localhost", httpClient = createClient(engineNullMsg))
        val vmNullMsg = AnalyticsViewModel(scope = this, analyticsApi = apiNullMsg)
        vmNullMsg.loadAnalytics(fallbackError = "Fallback error used")
        val state2 = vmNullMsg.state.first { !it.isLoading }
        assertNotNull(state2.errorMessage)
        assertEquals("Fallback error used", state2.errorMessage)
    }
}
