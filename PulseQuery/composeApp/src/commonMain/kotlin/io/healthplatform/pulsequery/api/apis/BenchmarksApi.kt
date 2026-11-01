/**
 * OpenAPI client for retrieving SQL and MPAX hospital optimization benchmark scenarios.
 */
@file:Suppress(
    "REDUNDANT_CALL_OF_CONVERSION_METHOD",
    "UNNECESSARY_SAFE_CALL",
    "ArrayInDataClass",
    "EnumEntryName",
    "RemoveRedundantQualifierName",
    "UnusedImport"
)

package io.healthplatform.pulsequery.api.apis

import io.healthplatform.pulsequery.api.infrastructure.ApiClient
import io.healthplatform.pulsequery.api.infrastructure.HttpResponse
import io.healthplatform.pulsequery.api.infrastructure.RequestConfig
import io.healthplatform.pulsequery.api.infrastructure.RequestMethod
import io.healthplatform.pulsequery.api.infrastructure.wrap
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.HttpClientEngine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/**
 * REST client for `/api/v1/benchmarks` endpoints providing gold-standard Text-to-SQL
 * and MPAX optimization benchmark scenarios.
 */
open class BenchmarksApi : ApiClient {

    /**
     * Constructs a [BenchmarksApi] instance using an optional [HttpClientEngine] and [Json] configuration.
     *
     * @param baseUrl Base URL of the PulseQuery backend server.
     * @param httpClientEngine Optional Ktor engine for HTTP requests.
     * @param httpClientConfig Optional configuration lambda for the underlying Ktor client.
     * @param jsonSerializer Custom kotlinx.serialization [Json] instance.
     */
    constructor(
        baseUrl: String = ApiClient.BASE_URL,
        httpClientEngine: HttpClientEngine? = null,
        httpClientConfig: ((HttpClientConfig<*>) -> Unit)? = null,
        jsonSerializer: Json = ApiClient.JSON_DEFAULT
    ) : super(
        baseUrl = baseUrl,
        httpClientEngine = httpClientEngine,
        httpClientConfig = httpClientConfig,
        jsonBlock = jsonSerializer
    )

    /**
     * Constructs a [BenchmarksApi] instance backed by an existing Ktor [HttpClient].
     *
     * @param baseUrl Base URL of the PulseQuery backend server.
     * @param httpClient Pre-configured Ktor [HttpClient] instance.
     */
    constructor(
        baseUrl: String,
        httpClient: HttpClient
    ) : super(baseUrl = baseUrl, httpClient = httpClient)

    /**
     * Retrieves the gold-standard Hospital Operations Optimization benchmark scenarios across Use Cases 1, 2, and 3.
     *
     * @return [HttpResponse] containing a list of strongly-typed `Map<String, JsonElement>` benchmark records.
     */
    open suspend fun getOptimizationBenchmarksApiV1BenchmarksOptimizationGet(): HttpResponse<List<Map<String, JsonElement>>> {
        val localVariableAuthNames = listOf<String>()
        val localVariableBody = io.ktor.client.utils.EmptyContent
        val localVariableQuery = mutableMapOf<String, List<String>>()
        val localVariableHeaders = mutableMapOf<String, String>()

        val localVariableConfig = RequestConfig<Unit>(
            RequestMethod.GET,
            "/api/v1/benchmarks/optimization",
            query = localVariableQuery,
            headers = localVariableHeaders,
            requiresAuthentication = false
        )

        return request(
            localVariableConfig,
            localVariableBody,
            localVariableAuthNames
        ).wrap()
    }

    /**
     * Retrieves the gold-standard Text-to-SQL benchmark scenarios.
     *
     * @return [HttpResponse] containing a list of strongly-typed `Map<String, JsonElement>` benchmark records.
     */
    open suspend fun getSqlBenchmarksApiV1BenchmarksSqlGet(): HttpResponse<List<Map<String, JsonElement>>> {
        val localVariableAuthNames = listOf<String>()
        val localVariableBody = io.ktor.client.utils.EmptyContent
        val localVariableQuery = mutableMapOf<String, List<String>>()
        val localVariableHeaders = mutableMapOf<String, String>()

        val localVariableConfig = RequestConfig<Unit>(
            RequestMethod.GET,
            "/api/v1/benchmarks/sql",
            query = localVariableQuery,
            headers = localVariableHeaders,
            requiresAuthentication = false
        )

        return request(
            localVariableConfig,
            localVariableBody,
            localVariableAuthNames
        ).wrap()
    }
}
