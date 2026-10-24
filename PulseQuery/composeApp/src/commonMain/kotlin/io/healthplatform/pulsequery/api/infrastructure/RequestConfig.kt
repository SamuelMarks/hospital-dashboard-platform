/**
 * HTTP request configuration model encapsulating method, path, headers, and query parameters.
 */
package io.healthplatform.pulsequery.api.infrastructure

/**
 * Defines a configuration object for a given HTTP request.
 *
 * @param T Type of the optional request body payload.
 * @property method HTTP verb for the request.
 * @property path Relative URL path on the API server.
 * @property headers Mutable map of HTTP request headers.
 * @property params Map of path/template parameters.
 * @property query Mutable map of multi-valued URL query parameters.
 * @property requiresAuthentication Whether the endpoint requires authentication credentials.
 * @property body Optional request payload of type [T].
 */
data class RequestConfig<T>(
    val method: RequestMethod,
    val path: String,
    val headers: MutableMap<String, String> = mutableMapOf(),
    val params: Map<String, String> = emptyMap(),
    val query: MutableMap<String, List<String>> = mutableMapOf(),
    val requiresAuthentication: Boolean,
    val body: T? = null
)
