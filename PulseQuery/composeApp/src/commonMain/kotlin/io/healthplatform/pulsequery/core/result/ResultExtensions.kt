/**
 * Result Percolation and Transformation Extensions Module.
 *
 * Provides monadic operations and asynchronous error handling adapters for [Result]
 * and Ktor [HttpResponse] structures throughout the PulseQuery application.
 */
package io.healthplatform.pulsequery.core.result

import io.healthplatform.pulsequery.api.infrastructure.HttpResponse
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * Transforms a successful [Result] by applying a function that returns another [Result],
 * flattening the resulting nested [Result] structure.
 *
 * @param T The type of the value contained in the current result.
 * @param R The type of the value contained in the returned result.
 * @param transform Function invoked with the successful value to produce a new [Result].
 * @return Flattened [Result] containing the transformed value, or the original failure.
 */
inline fun <T, R> Result<T>.flatMap(transform: (T) -> Result<R>): Result<R> =
    fold(
        onSuccess = { transform(it) },
        onFailure = { Result.failure(it) }
    )

/**
 * Extracts a human-readable error detail message from a raw HTTP response body string,
 * unwrapping FastAPI `{"detail": "..."}` JSON structures when present.
 *
 * @param rawBody Raw response body text from a non-2xx HTTP response.
 * @return Extracted human-readable error detail string.
 */
fun extractHttpErrorDetail(rawBody: String): String {
    val trimmed = rawBody.trim()
    if (!trimmed.startsWith("{")) return rawBody
    return runCatchingPulse {
        val obj = Json.parseToJsonElement(trimmed).jsonObject
        val detailElem = obj["detail"] ?: return@runCatchingPulse rawBody
        if (detailElem is JsonPrimitive) detailElem.content else detailElem.toString()
    }.getOrDefault(rawBody)
}

/**
 * Returns the encapsulated value if this [Result] is a success, or `null` on failure.
 *
 * @param T Type of the encapsulated result value.
 * @return Encapsulated [T] on success, or `null` on failure.
 */
fun <T> Result<T>.valueOrNull(): T? = getOrNull()

/**
 * Converts a typed [HttpResponse] into an idiomatic Kotlin [Result].
 * On successful HTTP status, extracts the deserialized body. On HTTP errors (non-2xx),
 * encapsulates an appropriate [PulseQueryError.Http] with the extracted response detail text.
 * Rethrows [CancellationException] to preserve structured concurrency cancellation.
 *
 * @param T Deserialized body entity type.
 * @return [Result] encapsulating the payload or structured [PulseQueryError].
 */
@Suppress("TooGenericExceptionCaught")
suspend fun <T : Any> HttpResponse<T>.asResult(): Result<T> {
    return if (this.success) {
        try {
            Result.success(this.body())
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (cause: Throwable) {
            Result.failure(
                PulseQueryError.Storage.SerializationFailure(
                    target = "HttpResponse body",
                    cause = cause
                )
            )
        }
    } else {
        val rawDetail = this.response.bodyAsText()
        val errorDetail = extractHttpErrorDetail(rawDetail)
        Result.failure(PulseQueryError.fromHttpStatus(this.status, errorDetail))
    }
}

/**
 * Executes a synchronous block, wrapping the output into a [Result] where any thrown
 * exception is converted to a typed [PulseQueryError] while preserving [CancellationException].
 *
 * @param T Target return type of the executed block.
 * @param block Code block to execute safely.
 * @return [Result] containing the block value or converted [PulseQueryError].
 */
@Suppress("TooGenericExceptionCaught")
inline fun <T> runCatchingPulse(block: () -> T): Result<T> {
    return try {
        Result.success(block())
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (throwable: Throwable) {
        Result.failure(PulseQueryError.fromThrowable(throwable))
    }
}

/**
 * Executes a suspending asynchronous block, wrapping the output into a [Result] where any thrown
 * exception is converted to a typed [PulseQueryError] while preserving [CancellationException].
 *
 * @param T Target return type of the executed block.
 * @param block Suspending code block to execute safely.
 * @return [Result] containing the block value or converted [PulseQueryError].
 */
@Suppress("TooGenericExceptionCaught")
suspend inline fun <T> runCatchingPulseAsync(crossinline block: suspend () -> T): Result<T> {
    return try {
        Result.success(block())
    } catch (cancellation: CancellationException) {
        throw cancellation
    } catch (throwable: Throwable) {
        Result.failure(PulseQueryError.fromThrowable(throwable))
    }
}

/**
 * Retrieves the underlying [PulseQueryError] from a failed [Result], converting any
 * generic [Throwable] if necessary. Returns null if the [Result] is successful.
 *
 * @param T Target result type.
 * @return Converted [PulseQueryError] on failure, or null on success.
 */
fun <T> Result<T>.toPulseQueryError(): PulseQueryError? {
    return exceptionOrNull()?.let { PulseQueryError.fromThrowable(it) }
}

/**
 * Extracts a user-facing error message from this [Throwable], returning [defaultMessage] when
 * the underlying exception or [PulseQueryError.General] cause had no explicit message.
 *
 * @param defaultMessage Fallback message to return when the underlying exception message is null.
 * @return Resolved user-facing error message string.
 */
fun Throwable.messageOrDefault(defaultMessage: String): String {
    val rawMsg = if (this is PulseQueryError.General && cause != null) cause.message else message
    return rawMsg ?: defaultMessage
}

/**
 * Extracts a user-facing error message from this [Throwable], falling back to the localized
 * [UiErrorKey.fallbackMessage] when the underlying exception has no message.
 *
 * @param errorKey Typed [UiErrorKey] providing the localized fallback message.
 * @return Resolved user-facing error message string.
 */
fun Throwable.messageOrDefault(errorKey: UiErrorKey): String =
    messageOrDefault(errorKey.fallbackMessage)
