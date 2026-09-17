package io.healthplatform.pulsequery.api

import io.healthplatform.pulsequery.api.auth.ApiKeyAuth
import io.healthplatform.pulsequery.api.auth.Authentication
import io.healthplatform.pulsequery.api.auth.HttpBasicAuth
import io.healthplatform.pulsequery.api.auth.HttpBearerAuth
import io.healthplatform.pulsequery.api.auth.OAuth
import io.healthplatform.pulsequery.api.infrastructure.ApiClient
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.mockEngine
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Unit tests verifying that [ApiClient] configuration methods return idiomatic [Result]
 * instead of throwing raw exceptions.
 */
class ApiClientAuthTest {

    private class TestApiClient(
        baseUrl: String = "http://localhost:8000",
        val testAuths: Map<String, Authentication> = emptyMap()
    ) : ApiClient(baseUrl = baseUrl, httpClientEngine = mockEngine, jsonBlock = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }) {
        override val authentications: Map<String, Authentication>
            get() = testAuths
    }

    @Test
    fun testBasicAuthUnconfiguredReturnsFailure() {
        val client = TestApiClient()
        val userRes = client.setUsername("admin")
        assertTrue(userRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(userRes.exceptionOrNull())
        assertEquals("No HTTP basic authentication configured", userRes.exceptionOrNull()?.message)

        val passRes = client.setPassword("secret")
        assertTrue(passRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(passRes.exceptionOrNull())
    }

    @Test
    fun testBasicAuthSuccess() {
        val basicAuth = HttpBasicAuth()
        val client = TestApiClient(testAuths = mutableMapOf("basic" to basicAuth))

        val userRes = client.setUsername("doctor_jones")
        assertTrue(userRes.isSuccess)
        assertEquals("doctor_jones", basicAuth.username)

        val passRes = client.setPassword("securePassword123")
        assertTrue(passRes.isSuccess)
        assertEquals("securePassword123", basicAuth.password)
    }

    @Test
    fun testApiKeyUnconfiguredReturnsFailure() {
        val client = TestApiClient()
        val keyRes = client.setApiKey("test-key")
        assertTrue(keyRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(keyRes.exceptionOrNull())

        val prefixRes = client.setApiKeyPrefix("Bearer")
        assertTrue(prefixRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(prefixRes.exceptionOrNull())
    }

    @Test
    fun testApiKeySuccess() {
        val apiKeyAuth = ApiKeyAuth("header", "X-API-KEY")
        val client = TestApiClient(testAuths = mutableMapOf("apiKey" to apiKeyAuth))

        val keyRes = client.setApiKey("clinical-token-xyz")
        assertTrue(keyRes.isSuccess)
        assertEquals("clinical-token-xyz", apiKeyAuth.apiKey)

        val prefixRes = client.setApiKeyPrefix("Token")
        assertTrue(prefixRes.isSuccess)
        assertEquals("Token", apiKeyAuth.apiKeyPrefix)
    }

    @Test
    fun testOAuthUnconfiguredReturnsFailure() {
        val client = TestApiClient()
        val tokenRes = client.setAccessToken("jwt-token-123")
        assertTrue(tokenRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(tokenRes.exceptionOrNull())
    }

    @Test
    fun testOAuthSuccess() {
        val oauth = OAuth()
        val client = TestApiClient(testAuths = mutableMapOf("oauth" to oauth))

        val tokenRes = client.setAccessToken("oauth-access-token")
        assertTrue(tokenRes.isSuccess)
        assertEquals("oauth-access-token", oauth.accessToken)
    }

    @Test
    fun testBearerUnconfiguredReturnsFailure() {
        val client = TestApiClient()
        val bearerRes = client.setBearerToken("bearer-token-123")
        assertTrue(bearerRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(bearerRes.exceptionOrNull())
    }

    @Test
    fun testBearerSuccess() {
        val bearer = HttpBearerAuth("Bearer")
        val client = TestApiClient(testAuths = mutableMapOf("bearer" to bearer))

        val bearerRes = client.setBearerToken("hospital-bearer-token")
        assertTrue(bearerRes.isSuccess)
        assertEquals("hospital-bearer-token", bearer.bearerToken)
    }
}
