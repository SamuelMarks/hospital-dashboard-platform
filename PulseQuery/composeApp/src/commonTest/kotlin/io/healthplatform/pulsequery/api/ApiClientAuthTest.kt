/**
 * Unit tests for [ApiClient] authentication helpers, HTTP infrastructure abstractions,
 * and binary serialization wrappers ([Base64ByteArray], [OctetByteArray]).
 */
package io.healthplatform.pulsequery.api

import io.healthplatform.pulsequery.api.auth.ApiKeyAuth
import io.healthplatform.pulsequery.api.auth.Authentication
import io.healthplatform.pulsequery.api.auth.HttpBasicAuth
import io.healthplatform.pulsequery.api.auth.HttpBearerAuth
import io.healthplatform.pulsequery.api.auth.OAuth
import io.healthplatform.pulsequery.api.infrastructure.ApiClient
import io.healthplatform.pulsequery.api.infrastructure.Base64ByteArray
import io.healthplatform.pulsequery.api.infrastructure.OctetByteArray
import io.healthplatform.pulsequery.api.infrastructure.PartConfig
import io.healthplatform.pulsequery.api.infrastructure.RequestConfig
import io.healthplatform.pulsequery.api.infrastructure.RequestMethod
import io.healthplatform.pulsequery.api.infrastructure.collectionDelimiter
import io.healthplatform.pulsequery.api.infrastructure.defaultMultiValueConverter
import io.healthplatform.pulsequery.api.infrastructure.map
import io.healthplatform.pulsequery.api.infrastructure.toMultiValue
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.mockEngine
import io.ktor.util.reflect.typeInfo
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Unit tests verifying that [ApiClient] configuration methods return idiomatic [Result]
 * instead of throwing raw exceptions, and that all infrastructure serializers and request helpers
 * cover every execution branch.
 */
class ApiClientAuthTest {

    /**
     * Test double subclass of [ApiClient] exposing protected request helpers for testing.
     *
     * @property testAuths Configured authentication schemes keyed by name.
     * @param baseUrl Base URL of the PulseQuery API server.
     * @param engine Optional Ktor HTTP engine.
     * @param config Optional Ktor HTTP client configuration callback.
     */
    private class TestApiClient(
        baseUrl: String = "http://localhost:8000",
        val testAuths: Map<String, Authentication> = emptyMap(),
        engine: io.ktor.client.engine.HttpClientEngine? = mockEngine,
        config: ((io.ktor.client.HttpClientConfig<*>) -> Unit)? = null
    ) : ApiClient(
            baseUrl = baseUrl,
            httpClientEngine = engine,
            httpClientConfig = config,
            jsonBlock = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
        ) {
        override val authentications: Map<String, Authentication>
            get() = testAuths

        /**
         * Delegates to protected [multipartFormRequest].
         *
         * @param requestConfig Request metadata configuration.
         * @param body Optional multipart form parts.
         * @param authNames Authentication scheme names.
         * @return Wrapped [io.healthplatform.pulsequery.api.infrastructure.HttpResponse].
         */
        suspend fun callMultipart(
            requestConfig: RequestConfig<Unit>,
            body: List<io.ktor.http.content.PartData>?,
            authNames: List<String>
        ) = multipartFormRequest(requestConfig, body, authNames)

        /**
         * Delegates to protected [urlEncodedFormRequest].
         *
         * @param requestConfig Request metadata configuration.
         * @param body Optional form parameters.
         * @param authNames Authentication scheme names.
         * @return Wrapped [io.healthplatform.pulsequery.api.infrastructure.HttpResponse].
         */
        suspend fun callUrlEncoded(
            requestConfig: RequestConfig<Unit>,
            body: io.ktor.http.Parameters?,
            authNames: List<String>
        ) = urlEncodedFormRequest(requestConfig, body, authNames)

        /**
         * Delegates to protected [request].
         *
         * @param requestConfig Request metadata configuration.
         * @param body Optional request payload.
         * @param authNames Authentication scheme names.
         * @return Wrapped [io.healthplatform.pulsequery.api.infrastructure.HttpResponse].
         */
        suspend fun callRawRequest(
            requestConfig: RequestConfig<Unit>,
            body: String?,
            authNames: List<String>
        ) = request(requestConfig, body, authNames)
    }

    /** Verifies [ApiClient.setUsername] and [ApiClient.setPassword] fail when no basic auth is configured. */
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

    /** Verifies [ApiClient.setUsername] and [ApiClient.setPassword] succeed when [HttpBasicAuth] is registered. */
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

    /** Verifies [ApiClient.setApiKey] and [ApiClient.setApiKeyPrefix] fail when no API key auth is configured. */
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

    /** Verifies [ApiClient.setApiKey] and [ApiClient.setApiKeyPrefix] succeed and filter by parameter name. */
    @Test
    fun testApiKeySuccess() {
        val apiKeyAuth = ApiKeyAuth("header", "X-API-KEY")
        val client = TestApiClient(testAuths = mutableMapOf("apiKey" to apiKeyAuth))

        val keyRes = client.setApiKey("clinical-token-xyz")
        assertTrue(keyRes.isSuccess)
        assertEquals("clinical-token-xyz", apiKeyAuth.apiKey)

        val keyMatchRes = client.setApiKey("matched-token", "X-API-KEY")
        assertTrue(keyMatchRes.isSuccess)
        assertEquals("matched-token", apiKeyAuth.apiKey)

        val keyMismatchRes = client.setApiKey("other", "OTHER-KEY")
        assertTrue(keyMismatchRes.isFailure)

        val prefixRes = client.setApiKeyPrefix("Token")
        assertTrue(prefixRes.isSuccess)
        assertEquals("Token", apiKeyAuth.apiKeyPrefix)

        val prefixMatchRes = client.setApiKeyPrefix("Bearer", "X-API-KEY")
        assertTrue(prefixMatchRes.isSuccess)
        assertEquals("Bearer", apiKeyAuth.apiKeyPrefix)

        val prefixMismatchRes = client.setApiKeyPrefix("Bearer", "OTHER-KEY")
        assertTrue(prefixMismatchRes.isFailure)
    }

    /** Verifies [ApiClient.setAccessToken] fails when no [OAuth] scheme is configured. */
    @Test
    fun testOAuthUnconfiguredReturnsFailure() {
        val client = TestApiClient()
        val tokenRes = client.setAccessToken("jwt-token-123")
        assertTrue(tokenRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(tokenRes.exceptionOrNull())
    }

    /** Verifies [ApiClient.setAccessToken] updates the registered [OAuth] scheme. */
    @Test
    fun testOAuthSuccess() {
        val oauth = OAuth()
        val client = TestApiClient(testAuths = mutableMapOf("oauth" to oauth))

        val tokenRes = client.setAccessToken("oauth-access-token")
        assertTrue(tokenRes.isSuccess)
        assertEquals("oauth-access-token", oauth.accessToken)
    }

    /** Verifies [ApiClient.setBearerToken] fails when no [HttpBearerAuth] scheme is configured. */
    @Test
    fun testBearerUnconfiguredReturnsFailure() {
        val client = TestApiClient()
        val bearerRes = client.setBearerToken("bearer-token-123")
        assertTrue(bearerRes.isFailure)
        assertIs<PulseQueryError.Auth.Unconfigured>(bearerRes.exceptionOrNull())
    }

    /** Verifies [ApiClient.setBearerToken] updates the registered [HttpBearerAuth] scheme. */
    @Test
    fun testBearerSuccess() {
        val bearer = HttpBearerAuth("Bearer")
        val client = TestApiClient(testAuths = mutableMapOf("bearer" to bearer))

        val bearerRes = client.setBearerToken("hospital-bearer-token")
        assertTrue(bearerRes.isSuccess)
        assertEquals("hospital-bearer-token", bearer.bearerToken)
    }

    /** Verifies header and query application across [HttpBearerAuth], [HttpBasicAuth], [ApiKeyAuth], and [OAuth]. */
    @Test
    fun testAuthSchemeApplyBranches() {
        val query = mutableMapOf<String, List<String>>()
        val headers = mutableMapOf<String, String>()

        // HttpBearerAuth
        val bearerCustom = HttpBearerAuth("Token")
        bearerCustom.apply(query, headers) // null token
        assertTrue(headers.isEmpty())
        bearerCustom.bearerToken = "t1"
        bearerCustom.apply(query, headers)
        assertEquals("Token t1", headers["Authorization"])

        val bearerLower = HttpBearerAuth("bearer")
        bearerLower.bearerToken = "t2"
        bearerLower.apply(query, headers)
        assertEquals("Bearer t2", headers["Authorization"])

        val bearerNoScheme = HttpBearerAuth(null)
        bearerNoScheme.bearerToken = "t3"
        bearerNoScheme.apply(query, headers)
        assertEquals("t3", headers["Authorization"])

        // HttpBasicAuth
        headers.clear()
        val basic = HttpBasicAuth()
        basic.apply(query, headers)
        assertTrue(headers.isEmpty())
        basic.username = "user"
        basic.apply(query, headers)
        assertTrue(headers.containsKey("Authorization"))
        basic.username = null
        basic.password = "pass"
        basic.apply(query, headers)
        assertTrue(headers.containsKey("Authorization"))

        // ApiKeyAuth
        headers.clear()
        query.clear()
        val keyHeader = ApiKeyAuth("header", "X-Key")
        keyHeader.apply(query, headers)
        assertTrue(headers.isEmpty())
        keyHeader.apiKey = "k1"
        keyHeader.apply(query, headers)
        assertEquals("k1", headers["X-Key"])
        keyHeader.apiKeyPrefix = "ApiKey"
        keyHeader.apply(query, headers)
        assertEquals("ApiKey k1", headers["X-Key"])

        val keyQuery = ApiKeyAuth("query", "api_key")
        keyQuery.apiKey = "k2"
        keyQuery.apply(query, headers)
        assertEquals(listOf("k2"), query["api_key"])

        val keyOther = ApiKeyAuth("cookie", "c")
        keyOther.apiKey = "k3"
        keyOther.apply(query, headers)

        // OAuth
        headers.clear()
        val oauth = OAuth()
        oauth.apply(query, headers)
        assertTrue(headers.isEmpty())
        oauth.accessToken = "oa1"
        oauth.apply(query, headers)
        assertEquals("Bearer oa1", headers["Authorization"])
    }

    /** Verifies query collection delimiters, [OctetByteArray], [Base64ByteArray], [PartConfig], and [RequestConfig]. */
    @Test
    fun testApiAbstractionsAndByteArraysAndConfigs() {
        assertEquals(",", collectionDelimiter("csv"))
        assertEquals("\t", collectionDelimiter("tsv"))
        assertEquals("|", collectionDelimiter("pipe"))
        assertEquals(" ", collectionDelimiter("space"))
        assertEquals("", collectionDelimiter("unknown"))

        assertEquals("42", defaultMultiValueConverter(42))
        assertEquals(listOf("a", "b"), toMultiValue(arrayOf("a", "b"), "multi"))
        assertEquals(listOf("a,b"), toMultiValue(listOf("a", "b"), "csv"))

        val octet1 = OctetByteArray(byteArrayOf(0x0a, 0x1b))
        val octet2 = OctetByteArray(byteArrayOf(0x0a, 0x1b))
        val octet3 = OctetByteArray(byteArrayOf(0x0f))
        assertEquals(2, octet1.value.size)
        assertEquals("OctetByteArray", OctetByteArray.descriptor.serialName)
        assertEquals(octet1, octet1)
        assertEquals(octet1, octet2)
        assertNotEquals(octet1, octet3)
        assertFalse(octet1.equals(null))
        assertFalse(octet1.equals("not octet"))
        assertEquals(octet1.hashCode(), octet2.hashCode())
        assertEquals("OctetByteArray(0a1b)", octet1.toString())
        val encodedOctet = Json.encodeToString(OctetByteArray.Companion, octet1)
        assertEquals(octet1, Json.decodeFromString(OctetByteArray.Companion, encodedOctet))
        assertEquals(
            OctetByteArray("zz".encodeToByteArray()),
            Json.decodeFromString(OctetByteArray.Companion, "\"zz\"")
        )

        val b64a = Base64ByteArray("pulse".encodeToByteArray())
        val b64b = Base64ByteArray("pulse".encodeToByteArray())
        val b64c = Base64ByteArray("other".encodeToByteArray())
        assertEquals(5, b64a.value.size)
        assertEquals("Base64ByteArray", Base64ByteArray.descriptor.serialName)
        assertEquals(b64a, b64a)
        assertEquals(b64a, b64b)
        assertNotEquals(b64a, b64c)
        assertFalse(b64a.equals(null))
        assertFalse(b64a.equals("str"))
        assertEquals(b64a.hashCode(), b64b.hashCode())
        assertTrue(b64a.toString().startsWith("Base64ByteArray("))
        val encodedB64 = Json.encodeToString(Base64ByteArray.Companion, b64a)
        assertEquals(b64a, Json.decodeFromString(Base64ByteArray.Companion, encodedB64))
        assertEquals(
            Base64ByteArray("!!!".encodeToByteArray()),
            Json.decodeFromString(Base64ByteArray.Companion, "\"!!!\"")
        )

        val partCfg = PartConfig(headers = mutableMapOf("X" to "1"), body = "payload")
        assertEquals("payload", partCfg.body)
        assertEquals("1", partCfg.headers["X"])

        val reqCfg = RequestConfig(
            method = RequestMethod.OPTIONS,
            path = "/api/test",
            requiresAuthentication = false,
            body = "b"
        )
        assertEquals(RequestMethod.OPTIONS, reqCfg.method)
        assertEquals(7, RequestMethod.entries.size)
    }

    /** Verifies [io.healthplatform.pulsequery.api.infrastructure.HttpResponse] body mapping and safe extraction. */
    @Test
    fun testHttpResponseSafeBodyAndMappedBody() = runTest {
        val dashApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(
            baseUrl = "http://localhost:8000",
            httpClientEngine = mockEngine
        )
        val resp = dashApi.listDashboardsApiV1DashboardsGet()
        assertTrue(resp.safeBody().isSuccess)
        assertTrue(resp.headers.isNotEmpty())

        val mapped = resp.map { size }
        assertEquals(1, mapped.safeBody().getOrThrow())
        assertTrue(
            mapped.safeTypedBody<List<io.healthplatform.pulsequery.api.models.DashboardResponse>>(
                typeInfo<List<io.healthplatform.pulsequery.api.models.DashboardResponse>>()
            ).isSuccess
        )
    }

    /** Verifies [ApiClient] constructors, multipart/form requests, and all [RequestMethod] branches. */
    @Test
    fun testApiClientRequestsAndConstructors() = runTest {
        var configInvoked = false
        val apiKeyAuth = ApiKeyAuth("header", "X-API-KEY").apply { apiKey = "k1" }
        val client = TestApiClient(
            testAuths = mapOf("apiKey" to apiKeyAuth),
            engine = mockEngine,
            config = { configInvoked = true }
        )
        assertTrue(configInvoked)

        // Constructor with null engine and default httpClientConfig parameter
        val defaultEngineClient = TestApiClient(engine = null, config = null)
        assertEquals("http://localhost:8000", defaultEngineClient.baseUrl)
        val directDefaultConfigClient = ApiClient(
            baseUrl = "http://localhost:8000",
            httpClientEngine = mockEngine,
            jsonBlock = ApiClient.JSON_DEFAULT
        )
        assertEquals("http://localhost:8000", directDefaultConfigClient.baseUrl)

        // Multipart form requests (null and non-null body)
        val mpCfg = RequestConfig<Unit>(
            method = RequestMethod.POST,
            path = "/api/v1/dashboards",
            headers = mutableMapOf(
                io.ktor.http.HttpHeaders.ContentType to "application/json",
                "X-Custom" to "val"
            ),
            requiresAuthentication = true
        )
        client.callMultipart(mpCfg, null, listOf("apiKey"))
        client.callMultipart(mpCfg, emptyList(), listOf("missingAuth"))

        // URL-encoded form requests (null and non-null body)
        val formCfg = RequestConfig<Unit>(
            method = RequestMethod.PUT,
            path = "/api/v1/dashboards",
            requiresAuthentication = false
        )
        client.callUrlEncoded(formCfg, null, emptyList())
        client.callUrlEncoded(formCfg, io.ktor.http.Parameters.Empty, emptyList())

        // All RequestMethod variants (GET, DELETE, HEAD, OPTIONS, PATCH, POST, PUT)
        for (method in RequestMethod.entries) {
            val cfg = RequestConfig<Unit>(
                method = method,
                path = "/api/v1/dashboards",
                requiresAuthentication = false
            )
            client.callRawRequest(cfg, "{}", emptyList())
        }
    }
}
