/**
 * Result Percolation and Transformation Extensions Module.
 *
 * Provides monadic operations and asynchronous error handling adapters for [Result]
 * and Ktor [HttpResponse] structures throughout the PulseQuery application.
 */
package io.healthplatform.pulsequery.core.result

import io.healthplatform.pulsequery.api.infrastructure.HttpResponse
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.ktor.client.statement.bodyAsText

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
 * Converts a typed [HttpResponse] into an idiomatic Kotlin [Result].
 * On successful HTTP status, extracts the deserialized body. On HTTP errors (non-2xx),
 * encapsulates an appropriate [PulseQueryError.Http] with the response body text.
 *
 * @param T Deserialized body entity type.
 * @return [Result] encapsulating the payload or structured [PulseQueryError].
 */
suspend fun <T : Any> HttpResponse<T>.asResult(): Result<T> {
    return if (this.success) {
        runCatching { this.body() }.recoverCatching { cause ->
            throw PulseQueryError.Storage.SerializationFailure(
                target = "HttpResponse body",
                cause = cause
            )
        }
    } else {
        val errorDetail = runCatching { this.response.bodyAsText() }.getOrDefault("")
        Result.failure(PulseQueryError.fromHttpStatus(this.status, errorDetail))
    }
}

/**
 * Executes a synchronous block, wrapping the output into a [Result] where any thrown
 * exception is converted to a typed [PulseQueryError].
 *
 * @param T Target return type of the executed block.
 * @param block Code block to execute safely.
 * @return [Result] containing the block value or converted [PulseQueryError].
 */
inline fun <T> runCatchingPulse(block: () -> T): Result<T> {
    return runCatching(block).recoverCatching { throwable ->
        throw PulseQueryError.fromThrowable(throwable)
    }
}

/**
 * Executes a suspending asynchronous block, wrapping the output into a [Result] where any thrown
 * exception is converted to a typed [PulseQueryError].
 *
 * @param T Target return type of the executed block.
 * @param block Suspending code block to execute safely.
 * @return [Result] containing the block value or converted [PulseQueryError].
 */
suspend inline fun <T> runCatchingPulseAsync(crossinline block: suspend () -> T): Result<T> {
    return try {
        Result.success(block())
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
