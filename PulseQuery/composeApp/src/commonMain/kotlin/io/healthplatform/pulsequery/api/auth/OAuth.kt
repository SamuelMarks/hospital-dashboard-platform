/**
 * OAuth2 Bearer access token authentication strategy module.
 */
package io.healthplatform.pulsequery.api.auth

/**
 * Applies an OAuth2 `Authorization: Bearer <accessToken>` header to outgoing HTTP requests.
 */
class OAuth : Authentication {
    /** Active OAuth2 access token string, or null if unauthenticated. */
    var accessToken: String? = null

    /**
     * Populates the `Authorization` header with `Bearer $accessToken` when [accessToken] is non-null.
     *
     * @param query Mutable map of multi-valued query parameters.
     * @param headers Mutable map of HTTP request headers.
     */
    override fun apply(query: MutableMap<String, List<String>>, headers: MutableMap<String, String>) {
        val token: String = accessToken ?: return
        headers["Authorization"] = "Bearer $token"
    }
}
