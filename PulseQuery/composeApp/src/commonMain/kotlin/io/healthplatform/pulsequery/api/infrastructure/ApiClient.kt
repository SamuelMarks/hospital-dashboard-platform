/**
 * Base Ktor HTTP client infrastructure for OpenAPI service implementations.
 */
package io.healthplatform.pulsequery.api.infrastructure

import io.healthplatform.pulsequery.api.auth.ApiKeyAuth
import io.healthplatform.pulsequery.api.auth.Authentication
import io.healthplatform.pulsequery.api.auth.HttpBasicAuth
import io.healthplatform.pulsequery.api.auth.HttpBearerAuth
import io.healthplatform.pulsequery.api.auth.OAuth
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.Parameters
import io.ktor.http.URLBuilder
import io.ktor.http.content.PartData
import io.ktor.http.contentType
import io.ktor.http.encodeURLQueryComponent
import io.ktor.http.encodedPath
import io.ktor.http.takeFrom
import io.ktor.serialization.kotlinx.json.json
import io.ktor.util.reflect.TypeInfo
import io.ktor.util.reflect.typeInfo
import kotlinx.serialization.json.Json

/**
 * Base HTTP client managing authentication schemes, JSON serialization, and request execution.
 *
 * @property baseUrl Base URL of the target PulseQuery backend server.
 */
open class ApiClient(
    @PublishedApi internal val baseUrl: String
) {

    @PublishedApi internal lateinit var client: HttpClient

    /**
     * Constructs an [ApiClient] with an optional [HttpClientEngine], custom config lambda, and [Json] serializer.
     *
     * @param baseUrl Base URL of the target backend server.
     * @param httpClientEngine Optional Ktor [HttpClientEngine] (e.g., `MockEngine` in tests).
     * @param httpClientConfig Optional configuration block applied to [HttpClientConfig].
     * @param jsonBlock [Json] serializer instance installed in [ContentNegotiation].
     */
    constructor(
        baseUrl: String,
        httpClientEngine: HttpClientEngine?,
        httpClientConfig: ((HttpClientConfig<*>) -> Unit)? = null,
        jsonBlock: Json
    ) : this(baseUrl = baseUrl) {
        val clientConfig: (HttpClientConfig<*>) -> Unit by lazy {
            {
                it.install(ContentNegotiation) { json(jsonBlock) }
                httpClientConfig?.invoke(it)
            }
        }

        client = if (httpClientEngine != null) {
            HttpClient(httpClientEngine, clientConfig)
        } else {
            HttpClient(clientConfig)
        }
    }

    /**
     * Constructs an [ApiClient] backed by an existing pre-configured Ktor [HttpClient].
     *
     * @param baseUrl Base URL of the target backend server.
     * @param httpClient Pre-configured Ktor [HttpClient] instance.
     */
    constructor(
        baseUrl: String,
        httpClient: HttpClient
    ) : this(baseUrl = baseUrl) {
        this.client = httpClient
    }

    /** Map of registered authentication schemes keyed by OpenAPI security scheme name. */
    protected open val authentications: Map<String, Authentication> by lazy {
        mapOf("OAuth2PasswordBearer" to OAuth())
    }

    /**
     * Default constants and shared serializer configuration for [ApiClient].
     */
    companion object {
        /** Default fallback base URL when none is provided. */
        const val BASE_URL: String = "http://localhost"

        /** Default lenient [Json] serializer configuration. */
        val JSON_DEFAULT: Json = Json {
            ignoreUnknownKeys = true
            prettyPrint = true
            isLenient = true
        }

        /** Headers managed directly by Ktor's content negotiation that must not be manually duplicated. */
        internal val UNSAFE_HEADERS: List<String> = listOf(HttpHeaders.ContentType)
    }

    /**
     * Sets the username for the first registered HTTP basic authentication scheme.
     *
     * @param username Basic auth username string.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setUsername(username: String): Result<Unit> {
        val auth = authentications.values.filterIsInstance<HttpBasicAuth>().firstOrNull()
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("HTTP basic"))
        auth.username = username
        return Result.success(Unit)
    }

    /**
     * Sets the password for the first registered HTTP basic authentication scheme.
     *
     * @param password Basic auth password string.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setPassword(password: String): Result<Unit> {
        val auth = authentications.values.filterIsInstance<HttpBasicAuth>().firstOrNull()
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("HTTP basic"))
        auth.password = password
        return Result.success(Unit)
    }

    /**
     * Sets the API key value for the matching (or first) API key authentication scheme.
     *
     * @param apiKey API key token string.
     * @param paramName Optional parameter name of the API key to target.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setApiKey(apiKey: String, paramName: String? = null): Result<Unit> {
        val auth = authentications.values.filterIsInstance<ApiKeyAuth>().firstOrNull {
            paramName == null || paramName == it.paramName
        } ?: return Result.failure(PulseQueryError.Auth.Unconfigured("API key"))
        auth.apiKey = apiKey
        return Result.success(Unit)
    }

    /**
     * Sets the API key prefix for the matching (or first) API key authentication scheme.
     *
     * @param apiKeyPrefix Prefix string prepended to the API key (e.g., "Token").
     * @param paramName Optional parameter name of the API key to target.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setApiKeyPrefix(apiKeyPrefix: String, paramName: String? = null): Result<Unit> {
        val auth = authentications.values.filterIsInstance<ApiKeyAuth>().firstOrNull {
            paramName == null || paramName == it.paramName
        } ?: return Result.failure(PulseQueryError.Auth.Unconfigured("API key prefix"))
        auth.apiKeyPrefix = apiKeyPrefix
        return Result.success(Unit)
    }

    /**
     * Sets the OAuth2 access token for the first registered OAuth authentication scheme.
     *
     * @param accessToken OAuth2 bearer access token.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setAccessToken(accessToken: String): Result<Unit> {
        val auth = authentications.values.filterIsInstance<OAuth>().firstOrNull()
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("OAuth2"))
        auth.accessToken = accessToken
        return Result.success(Unit)
    }

    /**
     * Sets the bearer token for the first registered HTTP bearer authentication scheme.
     *
     * @param bearerToken JWT or opaque bearer token string.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setBearerToken(bearerToken: String): Result<Unit> {
        val auth = authentications.values.filterIsInstance<HttpBearerAuth>().firstOrNull()
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("Bearer"))
        auth.bearerToken = bearerToken
        return Result.success(Unit)
    }

    /**
     * Executes a `multipart/form-data` HTTP request.
     *
     * @param T Type of the request configuration body metadata.
     * @param requestConfig Request configuration descriptor.
     * @param body Multipart form parts to transmit.
     * @param authNames Security scheme names required by the endpoint.
     * @return Raw Ktor [HttpResponse].
     */
    protected suspend fun <T> multipartFormRequest(
        requestConfig: RequestConfig<T>,
        body: List<PartData>?,
        authNames: List<String>
    ): HttpResponse {
        return request(requestConfig, MultiPartFormDataContent(body ?: emptyList()), authNames)
    }

    /**
     * Executes an `application/x-www-form-urlencoded` HTTP request.
     *
     * @param T Type of the request configuration body metadata.
     * @param requestConfig Request configuration descriptor.
     * @param body URL-encoded form [Parameters].
     * @param authNames Security scheme names required by the endpoint.
     * @return Raw Ktor [HttpResponse].
     */
    protected suspend fun <T> urlEncodedFormRequest(
        requestConfig: RequestConfig<T>,
        body: Parameters?,
        authNames: List<String>
    ): HttpResponse {
        return request(requestConfig, FormDataContent(body ?: Parameters.Empty), authNames)
    }

    /**
     * Executes an `application/json` HTTP request with a reified request body type [B].
     *
     * @param T Type of the request configuration body metadata.
     * @param B Serializable request payload type.
     * @param requestConfig Request configuration descriptor.
     * @param body Optional JSON serializable request body.
     * @param authNames Security scheme names required by the endpoint.
     * @return Raw Ktor [HttpResponse].
     */
    protected suspend inline fun <T, reified B> jsonRequest(
        requestConfig: RequestConfig<T>,
        body: B?,
        authNames: List<String>
    ): HttpResponse = executeTypedRequest(requestConfig, body, typeInfo<B>(), authNames)

    /**
     * Executes a configured HTTP request with a reified request body type [B].
     *
     * @param T Type of the request configuration body metadata.
     * @param B Request payload type.
     * @param requestConfig Request configuration descriptor.
     * @param body Optional request payload.
     * @param authNames Security scheme names required by the endpoint.
     * @return Raw Ktor [HttpResponse].
     */
    protected suspend inline fun <T, reified B> request(
        requestConfig: RequestConfig<T>,
        body: B?,
        authNames: List<String>
    ): HttpResponse = executeTypedRequest(requestConfig, body, typeInfo<B>(), authNames)

    /**
     * Executes a configured HTTP request against the underlying Ktor [HttpClient] using explicit [bodyType] metadata.
     *
     * @param T Type of the request configuration body metadata.
     * @param B Request payload type.
     * @param requestConfig Request configuration descriptor.
     * @param body Optional request payload.
     * @param bodyType Reflection [TypeInfo] describing [B].
     * @param authNames Security scheme names required by the endpoint.
     * @return Raw Ktor [HttpResponse].
     */
    @PublishedApi
    internal suspend fun <T, B> executeTypedRequest(
        requestConfig: RequestConfig<T>,
        body: B?,
        bodyType: TypeInfo,
        authNames: List<String>
    ): HttpResponse {
        requestConfig.updateForAuth(authNames)
        val headers = requestConfig.headers

        return client.request {
            this.url {
                this.takeFrom(URLBuilder(baseUrl))
                appendPath(requestConfig.path.trimStart('/').split('/'))
                requestConfig.query.forEach { query ->
                    query.value.forEach { value ->
                        parameter(query.key, value)
                    }
                }
            }
            this.method = requestConfig.method.httpMethod
            headers.filter { header -> !UNSAFE_HEADERS.contains(header.key) }
                .forEach { header -> this.header(header.key, header.value) }
            if (requestConfig.method in listOf(RequestMethod.PUT, RequestMethod.POST, RequestMethod.PATCH)) {
                val rawContentType = requestConfig.headers[HttpHeaders.ContentType]
                val contentType = if (rawContentType != null) {
                    ContentType.parse(rawContentType)
                } else {
                    ContentType.Application.Json
                }
                this.contentType(contentType)
                this.setBody(body, bodyType)
            }
        }
    }

    /**
     * Applies all matching authentication schemes in [authNames] to this [RequestConfig]'s query and headers.
     *
     * @param T Request configuration body type.
     * @param authNames List of security scheme identifiers.
     * @return [Result] containing [Unit] if all schemes were applied, or [PulseQueryError.Auth.Undefined] if missing.
     */
    @PublishedApi
    internal fun <T> RequestConfig<T>.updateForAuth(authNames: List<String>): Result<Unit> {
        for (authName in authNames) {
            val auth = authentications[authName]
                ?: return Result.failure(PulseQueryError.Auth.Undefined(authName))
            auth.apply(query, headers)
        }
        return Result.success(Unit)
    }

    /**
     * Appends URL-encoded path segments to this [URLBuilder].
     *
     * @param components Path segments to append.
     * @return Updated [URLBuilder] instance.
     */
    @PublishedApi
    internal fun URLBuilder.appendPath(components: List<String>): URLBuilder = apply {
        encodedPath = encodedPath.trimEnd('/') +
            components.joinToString("/", prefix = "/") { it.encodeURLQueryComponent() }
    }

    /**
     * Maps a domain [RequestMethod] to its corresponding Ktor [HttpMethod].
     */
    @PublishedApi
    internal val RequestMethod.httpMethod: HttpMethod
        get() = when (this) {
            RequestMethod.DELETE -> HttpMethod.Delete
            RequestMethod.GET -> HttpMethod.Get
            RequestMethod.HEAD -> HttpMethod.Head
            RequestMethod.PATCH -> HttpMethod.Patch
            RequestMethod.PUT -> HttpMethod.Put
            RequestMethod.POST -> HttpMethod.Post
            RequestMethod.OPTIONS -> HttpMethod.Options
        }
}
