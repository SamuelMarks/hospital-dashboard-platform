/**
 * HTTP Basic authentication strategy module.
 */
package io.healthplatform.pulsequery.api.auth

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Applies Base64-encoded `Authorization: Basic <credentials>` headers to outgoing HTTP requests.
 */
class HttpBasicAuth : Authentication {
    /** Basic authentication username, or null if unset. */
    var username: String? = null

    /** Basic authentication password, or null if unset. */
    var password: String? = null

    /**
     * Encodes [username] and [password] as Base64 and writes the `Authorization` header.
     *
     * @param query Mutable map of multi-valued query parameters.
     * @param headers Mutable map of HTTP request headers.
     */
    @OptIn(ExperimentalEncodingApi::class)
    override fun apply(query: MutableMap<String, List<String>>, headers: MutableMap<String, String>) {
        if (username == null && password == null) return
        val str = (username ?: "") + ":" + (password ?: "")
        val auth = Base64.Default.encode(str.encodeToByteArray())
        headers["Authorization"] = "Basic $auth"
    }
}
