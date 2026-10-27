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
 * instead of throwing raw exceptions.
 */
class ApiClientAuthTest {

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

        suspend fun callMultipart(
            requestConfig: RequestConfig<Unit>,
            body: List<io.ktor.http.content.PartData>?,
            authNames: List<String>
        ) = multipartFormRequest(requestConfig, body, authNames)

        suspend fun callUrlEncoded(
            requestConfig: RequestConfig<Unit>,
            body: io.ktor.http.Parameters?,
            authNames: List<String>
        ) = urlEncodedFormRequest(requestConfig, body, authNames)

        suspend fun callRawRequest(
            requestConfig: RequestConfig<Unit>,
            body: String?,
            authNames: List<String>
        ) = request(requestConfig, body, authNames)
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
        assertEquals(octet1, octet1)
        assertEquals(octet1, octet2)
        assertNotEquals(octet1, octet3)
        assertFalse(octet1.equals(null))
        assertFalse(octet1.equals("not octet"))
        assertEquals(octet1.hashCode(), octet2.hashCode())
        assertEquals("OctetByteArray(0a1b)", octet1.toString())
        val encodedOctet = Json.encodeToString(octet1)
        assertEquals(octet1, Json.decodeFromString<OctetByteArray>(encodedOctet))
        assertEquals(
            OctetByteArray("zz".encodeToByteArray()),
            Json.decodeFromString<OctetByteArray>("\"zz\"")
        )

        val b64a = Base64ByteArray("pulse".encodeToByteArray())
        val b64b = Base64ByteArray("pulse".encodeToByteArray())
        val b64c = Base64ByteArray("other".encodeToByteArray())
        assertEquals(b64a, b64a)
        assertEquals(b64a, b64b)
        assertNotEquals(b64a, b64c)
        assertFalse(b64a.equals(null))
        assertFalse(b64a.equals("str"))
        assertEquals(b64a.hashCode(), b64b.hashCode())
        assertTrue(b64a.toString().startsWith("Base64ByteArray("))
        val encodedB64 = Json.encodeToString(b64a)
        assertEquals(b64a, Json.decodeFromString<Base64ByteArray>(encodedB64))

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
