package io.healthplatform.pulsequery.network

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.plugin
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.url
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Tests verifying HttpClient factory and configuration under different token states,
 * timeout configurations, auth header injections, and error logging.
 */
class NetworkClientTest {

    @Test
    fun testCreateHttpClientWithToken() = runTest {
        var capturedAuthHeader: String? = null
        val mockEngine = MockEngine { request ->
            capturedAuthHeader = request.headers[HttpHeaders.Authorization]
            respond("OK", HttpStatusCode.OK)
        }
        val client = createHttpClient("https://api.pulsequery.com", engine = mockEngine) { "fake-jwt-token" }
        assertNotNull(client)
        val timeout = client.plugin(HttpTimeout)
        assertNotNull(timeout)
        client.get("/test")
        assertEquals("Bearer fake-jwt-token", capturedAuthHeader)
        client.close()
    }

    @Test
    fun testCreateHttpClientWithoutToken() = runTest {
        var capturedAuthHeader: String? = null
        val mockEngine = MockEngine { request ->
            capturedAuthHeader = request.headers[HttpHeaders.Authorization]
            respond("OK", HttpStatusCode.OK)
        }
        val client = createHttpClient("https://api.pulsequery.com", engine = mockEngine) { null }
        assertNotNull(client)
        val timeout = client.plugin(HttpTimeout)
        assertNotNull(timeout)
        client.get("/test")
        assertNull(capturedAuthHeader)
        client.close()
    }

    @Test
    fun testCreateHttpClientDefaultEngine() {
        val client = createHttpClient("https://api.pulsequery.com") { "token" }
        assertNotNull(client)
        client.close()
        val defaultClient = createHttpClient { null }
        assertNotNull(defaultClient)
        defaultClient.close()
    }

    @Test
    fun testAuthHeaderInjectionWithToken() = runTest {
        var capturedAuthHeader: String? = null
        val mockEngine = MockEngine { request ->
            capturedAuthHeader = request.headers[HttpHeaders.Authorization]
            respond("OK", HttpStatusCode.OK)
        }
        val client = HttpClient(mockEngine) {
            defaultRequest {
                url("https://api.pulsequery.com")
                header(HttpHeaders.Authorization, "Bearer token-12345")
            }
        }
        client.get("/test")
        assertEquals("Bearer token-12345", capturedAuthHeader)
        client.close()
    }

    @Test
    fun testAuthHeaderOmissionWithoutToken() = runTest {
        var capturedAuthHeader: String? = null
        val mockEngine = MockEngine { request ->
            capturedAuthHeader = request.headers[HttpHeaders.Authorization]
            respond("OK", HttpStatusCode.OK)
        }
        val client = HttpClient(mockEngine) {
            defaultRequest {
                url("https://api.pulsequery.com")
            }
        }
        client.get("/test")
        assertNull(capturedAuthHeader)
        client.close()
    }

    @Test
    fun testClientLoggingAndErrorHandling() = runTest {
        val logMessages = mutableListOf<String>()
        val customLogger = object : Logger {
            override fun log(message: String) {
                logMessages.add(message)
            }
        }
        val mockEngine = MockEngine { _ ->
            respond("Server Error", HttpStatusCode.InternalServerError)
        }
        val client = HttpClient(mockEngine) {
            install(Logging) {
                logger = customLogger
                level = LogLevel.ALL
            }
            expectSuccess = false
        }
        client.get("https://api.pulsequery.com/error")
        assertTrue(logMessages.isNotEmpty())
        client.close()
    }

    @Test
    fun testCreateHttpClientWithRefreshCallbacks() = runTest {
        var refreshedAccess: String? = null
        var refreshedRefresh: String? = null
        val client = createHttpClient(
            baseUrl = "https://api.pulsequery.com",
            engine = MockEngine { respond("OK", HttpStatusCode.OK) },
            refreshTokenProvider = { "active-refresh" },
            onTokenRefreshed = { a, r ->
                refreshedAccess = a
                refreshedRefresh = r
            },
            tokenProvider = { "active-access" }
        )
        assertNotNull(client)
        client.get("/test")
        client.close()
    }

    @Test
    fun testAppContainerRefreshSessionSuccess() = runTest {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("auth/refresh") -> {
                    respond(
                        """{"access_token":"rotated-jwt","token_type":"bearer","refresh_token":"rotated-refresh","expires_in":3600}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, "application/json")
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        io.healthplatform.pulsequery.di.AppContainer.setHttpClientForTest(client)
        io.healthplatform.pulsequery.di.AppContainer.refreshToken = "test-refresh"

        val success = io.healthplatform.pulsequery.di.AppContainer.refreshSession().isSuccess
        assertTrue(success)
        assertEquals("rotated-jwt", io.healthplatform.pulsequery.di.AppContainer.currentToken)
        assertEquals("rotated-refresh", io.healthplatform.pulsequery.di.AppContainer.refreshToken)
        io.healthplatform.pulsequery.di.AppContainer.resetForTest()
    }

    @Test
    fun testAppContainerRefreshSessionFailureLogsOut() = runTest {
        val mockEngine = MockEngine {
            respond("Unauthorized", HttpStatusCode.Unauthorized)
        }
        val client = HttpClient(mockEngine)
        io.healthplatform.pulsequery.di.AppContainer.setHttpClientForTest(client)
        io.healthplatform.pulsequery.di.AppContainer.currentToken = "old-token"
        io.healthplatform.pulsequery.di.AppContainer.refreshToken = "bad-refresh"

        val success = io.healthplatform.pulsequery.di.AppContainer.refreshSession().isSuccess
        assertTrue(!success)
        assertNull(io.healthplatform.pulsequery.di.AppContainer.currentToken)
        assertNull(io.healthplatform.pulsequery.di.AppContainer.refreshToken)
        io.healthplatform.pulsequery.di.AppContainer.resetForTest()
    }
}
