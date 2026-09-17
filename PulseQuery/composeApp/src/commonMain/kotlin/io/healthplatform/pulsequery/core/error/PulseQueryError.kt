/**
 * Core Domain Error Module for PulseQuery.
 *
 * Provides a unified sealed error hierarchy encapsulating network, HTTP, authentication,
 * storage, command, and general failures into typed [Throwable] derivatives compatible with [Result].
 */
package io.healthplatform.pulsequery.core.error

/**
 * Root sealed class representing domain-specific failure modes in PulseQuery.
 * Extends [Throwable] so instances can be encapsulated directly inside [Result.failure].
 *
 * @property message Descriptive failure explanation.
 * @property cause Optional underlying exception triggering this error.
 */
sealed class PulseQueryError(
    override val message: String,
    override val cause: Throwable? = null
) : Throwable(message, cause) {

    /**
     * Errors stemming from remote connectivity, timeouts, or network transport layers.
     *
     * @param message Descriptive network failure explanation.
     * @param cause Optional underlying exception triggering this error.
     */
    sealed class Network(
        message: String,
        cause: Throwable? = null
    ) : PulseQueryError(message, cause) {
        /**
         * Host is unreachable or connection was refused.
         *
         * @property host Target network address or host name.
         * @property cause Underlying connection failure exception.
         */
        data class Unreachable(
            val host: String,
            override val cause: Throwable? = null
        ) : Network("Backend unreachable at $host", cause)

        /**
         * Remote network socket or HTTP request timed out.
         *
         * @property message Custom timeout explanation.
         * @property cause Underlying timeout exception.
         */
        data class Timeout(
            override val message: String = "Network request timed out",
            override val cause: Throwable? = null
        ) : Network(message, cause)

        /**
         * Persistent WebSocket failure or closure.
         *
         * @property message WebSocket failure reason.
         * @property cause Underlying socket exception.
         */
        data class WebSocketFailure(
            override val message: String,
            override val cause: Throwable? = null
        ) : Network(message, cause)

        /**
         * Server-Sent Events (SSE) streaming failure.
         *
         * @property message SSE failure reason.
         * @property cause Underlying streaming exception.
         */
        data class SseFailure(
            override val message: String,
            override val cause: Throwable? = null
        ) : Network(message, cause)
    }

    /**
     * Errors representing non-2xx HTTP status codes returned from backend endpoints.
     *
     * @property statusCode Standard HTTP response status code.
     * @property reason Human-readable failure explanation.
     */
    sealed class Http(
        val statusCode: Int,
        val reason: String
    ) : PulseQueryError("HTTP $statusCode: $reason") {
        /**
         * HTTP 400 Bad Request.
         *
         * @property details Specific validation failure or rejection reason.
         */
        data class BadRequest(val details: String) : Http(400, details)

        /**
         * HTTP 401 Unauthorized / Unauthenticated.
         *
         * @property details Reason for unauthenticated status.
         */
        data class Unauthorized(
            val details: String = "Authentication required or credentials invalid"
        ) : Http(401, details)

        /**
         * HTTP 403 Forbidden.
         *
         * @property details Permission denial explanation.
         */
        data class Forbidden(val details: String = "Access denied") : Http(403, details)

        /**
         * HTTP 404 Not Found.
         *
         * @property entity Name or identifier of missing resource.
         */
        data class NotFound(val entity: String) : Http(404, "$entity not found")

        /**
         * HTTP 409 Conflict.
         *
         * @property details Conflict explanation.
         */
        data class Conflict(val details: String) : Http(409, details)

        /**
         * HTTP 5xx Server Error.
         *
         * @property code Integer 5xx HTTP response status code.
         * @property details Detailed server diagnostics or error text.
         */
        data class ServerError(val code: Int, val details: String) : Http(code, details)

        /**
         * Any other 4xx Client Error.
         *
         * @property code Integer 4xx HTTP response status code.
         * @property details Explanation of client rejection.
         */
        data class ClientError(val code: Int, val details: String) : Http(code, details)
    }

    /**
     * Errors related to user authentication and API key / Bearer token security configuration.
     *
     * @param message Authentication error message.
     * @param cause Underlying exception if available.
     */
    sealed class Auth(
        message: String,
        cause: Throwable? = null
    ) : PulseQueryError(message, cause) {
        /**
         * Authentication provider has not been configured on the API client.
         *
         * @property authType Label of the unconfigured authentication mechanism.
         */
        data class Unconfigured(val authType: String) :
            Auth("No $authType authentication configured")

        /**
         * Authentication scheme name was not found in registry.
         *
         * @property authName Unrecognized authentication scheme key.
         */
        data class Undefined(val authName: String) :
            Auth("Authentication undefined: $authName")

        /**
         * User session or refresh token has expired or is invalid.
         *
         * @property message Session expiry explanation.
         */
        data class SessionExpired(
            override val message: String = "Session expired or refresh token invalid"
        ) : Auth(message)

        /**
         * Action requires an authenticated user but none was found.
         *
         * @property message Description of unauthenticated context.
         */
        data class Unauthenticated(
            override val message: String = "User is not currently authenticated"
        ) : Auth(message)
    }

    /**
     * Errors arising during local disk, cache, or database file operations.
     *
     * @param message Storage failure description.
     * @param cause Underlying file or database exception.
     */
    sealed class Storage(
        message: String,
        cause: Throwable? = null
    ) : PulseQueryError(message, cause) {
        /**
         * Target directory could not be located or resolved on the platform.
         *
         * @property path Missing filesystem path string.
         */
        data class DirectoryNotFound(val path: String) :
            Storage("Directory not found: $path")

        /**
         * Failed to write binary or text payload to file path.
         *
         * @property filename Target file name.
         * @property path Destination filesystem path.
         * @property cause Underlying I/O exception.
         */
        data class WriteFailure(
            val filename: String,
            val path: String,
            override val cause: Throwable? = null
        ) : Storage("Failed to write $filename to $path", cause)

        /**
         * Failed to encode or decode serialization payload.
         *
         * @property target Serialized class or schema name.
         * @property cause Underlying serialization exception.
         */
        data class SerializationFailure(
            val target: String,
            override val cause: Throwable? = null
        ) : Storage("Failed to serialize/deserialize $target", cause)
    }

    /**
     * Errors related to command pattern execution (Undo / Redo stack state).
     *
     * @param message Command error description.
     * @param cause Underlying failure exception.
     */
    sealed class Command(
        message: String,
        cause: Throwable? = null
    ) : PulseQueryError(message, cause) {
        /**
         * No reversible actions present on the undo stack.
         *
         * @property message Undo unavailability explanation.
         */
        data class NoUndoAvailable(
            override val message: String = "No actions available to undo"
        ) : Command(message)

        /**
         * No reversible actions present on the redo stack.
         *
         * @property message Redo unavailability explanation.
         */
        data class NoRedoAvailable(
            override val message: String = "No actions available to redo"
        ) : Command(message)

        /**
         * Command execution or rollback failed.
         *
         * @property reason Description of why execution or rollback failed.
         * @property cause Underlying exception.
         */
        data class ExecutionFailed(
            val reason: String,
            override val cause: Throwable? = null
        ) : Command("Command execution failed: $reason", cause)
    }

    /**
     * Unclassified or generic runtime errors.
     *
     * @property message Error details.
     * @property cause Underlying throwable if available.
     */
    data class General(
        override val message: String,
        override val cause: Throwable? = null
    ) : PulseQueryError(message, cause)

    companion object {
        /**
         * Maps an HTTP status code and error body into the corresponding [PulseQueryError.Http].
         *
         * @param statusCode HTTP status response integer.
         * @param reason Detail message describing the failure.
         * @return Specific [PulseQueryError.Http] subclass matching the status code.
         */
        fun fromHttpStatus(statusCode: Int, reason: String = ""): Http {
            val message = reason.ifBlank { "HTTP Error $statusCode" }
            return when (statusCode) {
                400 -> Http.BadRequest(message)
                401 -> Http.Unauthorized(message)
                403 -> Http.Forbidden(message)
                404 -> Http.NotFound(message)
                409 -> Http.Conflict(message)
                in 500..599 -> Http.ServerError(statusCode, message)
                else -> Http.ClientError(statusCode, message)
            }
        }

        /**
         * Maps any generic [Throwable] into a [PulseQueryError].
         *
         * @param throwable Original exception or error.
         * @return Wrapped or converted [PulseQueryError].
         */
        fun fromThrowable(throwable: Throwable): PulseQueryError {
            return if (throwable is PulseQueryError) {
                throwable
            } else {
                General(throwable.message ?: "Unknown error occurred", throwable)
            }
        }
    }
}
