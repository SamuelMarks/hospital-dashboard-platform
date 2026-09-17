package io.healthplatform.pulsequery.api.infrastructure

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.*
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.serialization.kotlinx.json.json
import io.ktor.http.*
import io.ktor.http.content.PartData
import io.ktor.http.contentType
import kotlin.Unit
import kotlinx.serialization.json.Json

import io.healthplatform.pulsequery.api.auth.*
import io.healthplatform.pulsequery.core.error.PulseQueryError

open class ApiClient(
        private val baseUrl: String
) {

    private lateinit var client: HttpClient

    constructor(
        baseUrl: String,
        httpClientEngine: HttpClientEngine?,
        httpClientConfig: ((HttpClientConfig<*>) -> Unit)? = null,
        jsonBlock: Json,
    ) : this(baseUrl = baseUrl) {
        val clientConfig: (HttpClientConfig<*>) -> Unit by lazy {
            {
                it.install(ContentNegotiation) { json(jsonBlock) }
                httpClientConfig?.invoke(it)
            }
        }

        client = httpClientEngine?.let { HttpClient(it, clientConfig) } ?: HttpClient(clientConfig)
    }

    constructor(
        baseUrl: String,
        httpClient: HttpClient
    ): this(baseUrl = baseUrl) {
        this.client = httpClient
    }

    protected open val authentications: kotlin.collections.Map<String, Authentication> by lazy {
        mapOf(
                "OAuth2PasswordBearer" to OAuth())
    }

    companion object {
        const val BASE_URL: String = "http://localhost"
        val JSON_DEFAULT: Json = Json {
          ignoreUnknownKeys = true
          prettyPrint = true
          isLenient = true
        }
        protected val UNSAFE_HEADERS: List<String> = listOf(HttpHeaders.ContentType)
    }

    /**
     * Set the username for the first HTTP basic authentication.
     *
     * @param username Username
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setUsername(username: String): Result<Unit> {
        val auth = authentications?.values?.firstOrNull { it is HttpBasicAuth } as HttpBasicAuth?
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("HTTP basic"))
        auth.username = username
        return Result.success(Unit)
    }

    /**
     * Set the password for the first HTTP basic authentication.
     *
     * @param password Password
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setPassword(password: String): Result<Unit> {
        val auth = authentications?.values?.firstOrNull { it is HttpBasicAuth } as HttpBasicAuth?
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("HTTP basic"))
        auth.password = password
        return Result.success(Unit)
    }

    /**
     * Set the API key value for the first API key authentication.
     *
     * @param apiKey API key
     * @param paramName The name of the API key parameter, or null or set the first key.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setApiKey(apiKey: String, paramName: String? = null): Result<Unit> {
        val auth = authentications?.values?.firstOrNull { it is ApiKeyAuth && (paramName == null || paramName == it.paramName) } as ApiKeyAuth?
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("API key"))
        auth.apiKey = apiKey
        return Result.success(Unit)
    }

    /**
     * Set the API key prefix for the first API key authentication.
     *
     * @param apiKeyPrefix API key prefix
     * @param paramName The name of the API key parameter, or null or set the first key.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setApiKeyPrefix(apiKeyPrefix: String, paramName: String? = null): Result<Unit> {
        val auth = authentications?.values?.firstOrNull { it is ApiKeyAuth && (paramName == null || paramName == it.paramName) } as ApiKeyAuth?
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("API key prefix"))
        auth.apiKeyPrefix = apiKeyPrefix
        return Result.success(Unit)
    }

    /**
     * Set the access token for the first OAuth2 authentication.
     *
     * @param accessToken Access token
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setAccessToken(accessToken: String): Result<Unit> {
        val auth = authentications?.values?.firstOrNull { it is OAuth } as OAuth?
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("OAuth2"))
        auth.accessToken = accessToken
        return Result.success(Unit)
    }

    /**
     * Set the access token for the first Bearer authentication.
     *
     * @param bearerToken The bearer token.
     * @return [Result] containing [Unit] on success, or [PulseQueryError.Auth.Unconfigured] on failure.
     */
    fun setBearerToken(bearerToken: String): Result<Unit> {
        val auth = authentications?.values?.firstOrNull { it is HttpBearerAuth } as HttpBearerAuth?
            ?: return Result.failure(PulseQueryError.Auth.Unconfigured("Bearer"))
        auth.bearerToken = bearerToken
        return Result.success(Unit)
    }

    protected suspend fun <T: Any?> multipartFormRequest(requestConfig: RequestConfig<T>, body: kotlin.collections.List<PartData>?, authNames: kotlin.collections.List<String>): HttpResponse {
        return request(requestConfig, MultiPartFormDataContent(body ?: listOf()), authNames)
    }

    protected suspend fun <T: Any?> urlEncodedFormRequest(requestConfig: RequestConfig<T>, body: Parameters?, authNames: kotlin.collections.List<String>): HttpResponse {
        return request(requestConfig, FormDataContent(body ?: Parameters.Empty), authNames)
    }

    protected suspend fun <T: Any?> jsonRequest(requestConfig: RequestConfig<T>, body: Any? = null, authNames: kotlin.collections.List<String>): HttpResponse = request(requestConfig, body, authNames)

    protected suspend fun <T: Any?> request(requestConfig: RequestConfig<T>, body: Any? = null, authNames: kotlin.collections.List<String>): HttpResponse {
        requestConfig.updateForAuth<T>(authNames)
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
            headers.filter { header -> !UNSAFE_HEADERS.contains(header.key) }.forEach { header -> this.header(header.key, header.value) }
            if (requestConfig.method in listOf(RequestMethod.PUT, RequestMethod.POST, RequestMethod.PATCH)) {
                val contentType = (requestConfig.headers[HttpHeaders.ContentType]?.let { ContentType.parse(it) }
                    ?: ContentType.Application.Json)
                this.contentType(contentType)
                this.setBody(body)
            }
        }
    }

    private fun <T: Any?> RequestConfig<T>.updateForAuth(authNames: kotlin.collections.List<String>): Result<Unit> {
        for (authName in authNames) {
            val auth = authentications?.get(authName)
                ?: return Result.failure(PulseQueryError.Auth.Undefined(authName))
            auth.apply(query, headers)
        }
        return Result.success(Unit)
    }

    private fun URLBuilder.appendPath(components: kotlin.collections.List<String>): URLBuilder = apply {
        encodedPath = encodedPath.trimEnd('/') + components.joinToString("/", prefix = "/") { it.encodeURLQueryComponent() }
    }

    private val RequestMethod.httpMethod: HttpMethod
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
