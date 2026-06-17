package io.healthplatform.pulsequery.api.auth

import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

class HttpBasicAuth : Authentication {
    var username: String? = null
    var password: String? = null

    @OptIn(ExperimentalEncodingApi::class)
    override fun apply(query: MutableMap<String, List<String>>, headers: MutableMap<String, String>) {
        if (username == null && password == null) return
        val str = (username ?: "") + ":" + (password ?: "")
        val auth = Base64.Default.encode(str.encodeToByteArray())
        headers["Authorization"] = "Basic $auth"
    }
}
