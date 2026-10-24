/**
 * Authentication strategy contract for applying credentials to outgoing HTTP requests.
 */
package io.healthplatform.pulsequery.api.auth

/**
 * Contract for applying authentication credentials to HTTP request query parameters and headers.
 */
interface Authentication {

    /**
     * Applies authentication settings to [query] and [headers].
     *
     * @param query Mutable map of multi-valued query parameters.
     * @param headers Mutable map of HTTP request headers.
     */
    fun apply(query: MutableMap<String, List<String>>, headers: MutableMap<String, String>)
}
