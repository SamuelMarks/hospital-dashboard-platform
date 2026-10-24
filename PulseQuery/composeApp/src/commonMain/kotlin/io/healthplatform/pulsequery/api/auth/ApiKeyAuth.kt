/**
 * API Key authentication strategy module supporting header and query parameter placement.
 */
package io.healthplatform.pulsequery.api.auth

/**
 * Applies an API key credential to either HTTP request headers or query parameters.
 *
 * @property location Target placement location ("query" or "header").
 * @property paramName Header name or query parameter key.
 */
class ApiKeyAuth(private val location: String, val paramName: String) : Authentication {
    /** Active API key secret value, or null if unset. */
    var apiKey: String? = null

    /** Optional prefix prepended to [apiKey] (e.g., "Token" or "Bearer"). */
    var apiKeyPrefix: String? = null

    /**
     * Applies [apiKey] (and optional [apiKeyPrefix]) to [query] or [headers] based on [location].
     *
     * @param query Mutable map of multi-valued query parameters.
     * @param headers Mutable map of HTTP request headers.
     */
    override fun apply(query: MutableMap<String, List<String>>, headers: MutableMap<String, String>) {
        val key: String = apiKey ?: return
        val prefix: String? = apiKeyPrefix
        val value: String = if (prefix != null) "$prefix $key" else key
        when (location) {
            "query" -> query[paramName] = listOf(value)
            "header" -> headers[paramName] = value
        }
    }
}
