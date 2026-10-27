/**
 * HTTP response wrapper and typed body provider module for Ktor responses.
 */
package io.healthplatform.pulsequery.api.infrastructure

import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.ktor.client.call.body
import io.ktor.http.Headers
import io.ktor.http.isSuccess
import io.ktor.util.reflect.TypeInfo
import io.ktor.util.reflect.typeInfo

/**
 * Wraps a raw Ktor [io.ktor.client.statement.HttpResponse] with a typed [BodyProvider].
 *
 * @param T Expected deserialized body type.
 * @property response Underlying Ktor HTTP response statement.
 * @property provider Strategy used to deserialize the response body into [T].
 */
open class HttpResponse<T : Any>(
    val response: io.ktor.client.statement.HttpResponse,
    val provider: BodyProvider<T>
) {
    /** Numeric HTTP status code (e.g., 200, 404, 500). */
    val status: Int = response.status.value

    /** True if [status] is in the 2xx success range. */
    val success: Boolean = response.status.isSuccess()

    /** Multi-valued map of HTTP response headers. */
    val headers: Map<String, List<String>> = response.headers.mapEntries()

    /**
     * Deserializes and returns the response payload of type [T].
     *
     * @return Deserialized body instance.
     */
    suspend fun body(): T = provider.body(response)

    /**
     * Safely deserializes the response payload of type [T] wrapped in a [Result].
     *
     * @return [Result] containing the deserialized body [T] or a [io.healthplatform.pulsequery.core.error.PulseQueryError].
     */
    suspend fun safeBody(): Result<T> = asResult()

    /**
     * Deserializes the response payload into an explicit target [type].
     *
     * @param V Target return type.
     * @param type Reflection [TypeInfo] describing [V].
     * @return Deserialized instance of [V].
     */
    suspend fun <V : Any> typedBody(type: TypeInfo): V = provider.typedBody(response, type)

    /**
     * Safely deserializes the response payload into an explicit target [type] wrapped in a [Result].
     *
     * @param V Target return type.
     * @param type Reflection [TypeInfo] describing [V].
     * @return [Result] containing [V] or a [io.healthplatform.pulsequery.core.error.PulseQueryError].
     */
    suspend fun <V : Any> safeTypedBody(type: TypeInfo): Result<V> = runCatchingPulseAsync { typedBody(type) }

    /**
     * Companion utilities for header transformation on [HttpResponse].
     */
    companion object {
        /**
         * Converts Ktor [Headers] into an immutable [Map] of header names to value lists.
         *
         * @return Map of header keys to lists of header values.
         */
        private fun Headers.mapEntries(): Map<String, List<String>> {
            val result = mutableMapOf<String, List<String>>()
            entries().forEach { result[it.key] = it.value }
            return result
        }
    }
}

/**
 * Strategy interface for extracting and transforming typed payloads from a Ktor HTTP response.
 *
 * @param T Deserialized payload type.
 */
interface BodyProvider<T : Any> {
    /**
     * Extracts the primary body of type [T] from [response].
     *
     * @param response Ktor HTTP response statement.
     * @return Deserialized payload of type [T].
     */
    suspend fun body(response: io.ktor.client.statement.HttpResponse): T

    /**
     * Extracts an arbitrary typed body of type [V] using [type] metadata.
     *
     * @param V Target deserialization type.
     * @param response Ktor HTTP response statement.
     * @param type Ktor [TypeInfo] metadata for [V].
     * @return Deserialized payload of type [V].
     */
    suspend fun <V : Any> typedBody(response: io.ktor.client.statement.HttpResponse, type: TypeInfo): V
}

/**
 * [BodyProvider] implementation backed by Ktor's `response.body(TypeInfo)` pipeline.
 *
 * @param T Expected deserialized body type.
 * @property type Reflection [TypeInfo] for [T].
 */
class TypedBodyProvider<T : Any>(private val type: TypeInfo) : BodyProvider<T> {
    /**
     * Deserializes the response body using [type].
     *
     * @param response Ktor HTTP response statement.
     * @return Deserialized instance of [T].
     */
    override suspend fun body(response: io.ktor.client.statement.HttpResponse): T =
        response.body(type)

    /**
     * Deserializes the response body using the supplied [type].
     *
     * @param V Target return type.
     * @param response Ktor HTTP response statement.
     * @param type Ktor [TypeInfo] metadata for [V].
     * @return Deserialized instance of [V].
     */
    override suspend fun <V : Any> typedBody(response: io.ktor.client.statement.HttpResponse, type: TypeInfo): V =
        response.body(type)
}

/**
 * [BodyProvider] decorator that transforms a source payload [S] into [T] via [block].
 *
 * @param S Source deserialized type.
 * @param T Target mapped type.
 * @property provider Underlying source [BodyProvider].
 * @property block Mapping function converting [S] to [T].
 */
class MappedBodyProvider<S : Any, T : Any>(
    private val provider: BodyProvider<S>,
    private val block: S.() -> T
) : BodyProvider<T> {
    /**
     * Deserializes [S] from [provider] and transforms it to [T] using [block].
     *
     * @param response Ktor HTTP response statement.
     * @return Mapped payload of type [T].
     */
    override suspend fun body(response: io.ktor.client.statement.HttpResponse): T =
        block(provider.body(response))

    /**
     * Delegates arbitrary typed body extraction to [provider].
     *
     * @param V Target return type.
     * @param response Ktor HTTP response statement.
     * @param type Ktor [TypeInfo] metadata for [V].
     * @return Deserialized instance of [V].
     */
    override suspend fun <V : Any> typedBody(response: io.ktor.client.statement.HttpResponse, type: TypeInfo): V =
        provider.typedBody(response, type)
}

/**
 * Wraps a raw Ktor [io.ktor.client.statement.HttpResponse] into a typed [HttpResponse] for reified type [T].
 *
 * @param T Target body type.
 * @return Typed [HttpResponse] wrapper.
 */
inline fun <reified T : Any> io.ktor.client.statement.HttpResponse.wrap(): HttpResponse<T> =
    HttpResponse(this, TypedBodyProvider(typeInfo<T>()))

/**
 * Transforms the payload type of an [HttpResponse] from [T] to [V] using [block].
 *
 * @param T Original payload type.
 * @param V Mapped payload type.
 * @param block Transformation lambda applied to [T].
 * @return Mapped [HttpResponse] of type [V].
 */
fun <T : Any, V : Any> HttpResponse<T>.map(block: T.() -> V): HttpResponse<V> =
    HttpResponse(response, MappedBodyProvider(provider, block))
