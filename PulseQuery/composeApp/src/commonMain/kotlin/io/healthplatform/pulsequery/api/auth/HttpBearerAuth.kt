/**
 * HTTP Bearer token authentication strategy module.
 */
package io.healthplatform.pulsequery.api.auth

/**
 * Applies an HTTP `Authorization` header using a bearer token and optional scheme prefix.
 *
 * @property scheme Optional authentication scheme string (e.g., "Bearer").
 */
class HttpBearerAuth(private val scheme: String?) : Authentication {
    /** Active bearer token string applied to outgoing requests, or null if unset. */
    var bearerToken: String? = null

    /**
     * Populates the `Authorization` header with [bearerToken] when non-null.
     *
     * @param query Mutable map of multi-valued query parameters.
     * @param headers Mutable map of HTTP request headers.
     */
    override fun apply(query: MutableMap<String, List<String>>, headers: MutableMap<String, String>) {
        val token: String = bearerToken ?: return
        headers["Authorization"] = (if (scheme != null) "${upperCaseBearer(scheme)} " else "") + token
    }

    /**
     * Normalizes a case-insensitive `"bearer"` scheme string to canonical `"Bearer"`.
     *
     * @param scheme Configured scheme name.
     * @return Normalized scheme string.
     */
    private fun upperCaseBearer(scheme: String): String {
        return if ("bearer".equals(scheme, ignoreCase = true)) "Bearer" else scheme
    }
}
