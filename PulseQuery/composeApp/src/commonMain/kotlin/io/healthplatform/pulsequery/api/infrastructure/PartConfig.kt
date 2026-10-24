/**
 * Multipart form part configuration model encapsulating part headers and payload body.
 */
package io.healthplatform.pulsequery.api.infrastructure

/**
 * Defines a configuration object for a single part of a `multipart/form-data` request.
 *
 * @param T Type of the optional part body payload.
 * @property headers Mutable map of part-specific HTTP headers.
 * @property body Optional payload of type [T] for the multipart section.
 */
data class PartConfig<T>(
    val headers: MutableMap<String, String> = mutableMapOf(),
    val body: T? = null
)
