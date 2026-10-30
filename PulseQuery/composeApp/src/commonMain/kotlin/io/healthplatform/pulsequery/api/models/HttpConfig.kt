/**
 * Configuration schema for external HTTP endpoint dashboard widgets.
 */
@file:Suppress(
    "REDUNDANT_CALL_OF_CONVERSION_METHOD",
    "UNNECESSARY_SAFE_CALL",
    "ArrayInDataClass",
    "EnumEntryName",
    "RemoveRedundantQualifierName",
    "UnusedImport",
    "EnumNaming"
)

package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.Required
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Configuration schema for HTTP-type widgets. Enforces the presence of a valid URL and standard HTTP properties.
 *
 * @property url The fully qualified target URL.
 * @property x Grid X position.
 * @property y Grid Y position.
 * @property w Grid Width (cols).
 * @property h Grid Height (rows).
 * @property method HTTP Method verb.
 * @property headers Request Headers map.
 * @property params Query Parameters map.
 * @property body JSON Body payload.
 * @property metaForwardAuth If true, forwards the user's JWT to the target.
 * @property xKey Optional key path for X-Axis/Labels.
 * @property yKey Optional key path for Y-Axis/Values.
 * @property subtitle Optional subtitle or caption explaining what the widget measures or displays.
 * @property description Optional description or clinical guidance for the widget.
 */
@Serializable
data class HttpConfig(
    @SerialName(value = "url") @Required val url: kotlin.String,
    @SerialName(value = "x") val x: kotlin.Int? = 0,
    @SerialName(value = "y") val y: kotlin.Int? = 0,
    @SerialName(value = "w") val w: kotlin.Int? = 6,
    @SerialName(value = "h") val h: kotlin.Int? = 4,
    @SerialName(value = "method") val method: HttpConfig.Method? = Method.GET,
    @SerialName(value = "headers") val headers: kotlin.collections.Map<kotlin.String, kotlin.String>? = null,
    @SerialName(value = "params") val params: kotlin.collections.Map<kotlin.String, kotlin.String>? = null,
    @SerialName(value = "body") val body: JsonElement? = null,
    @SerialName(value = "meta_forward_auth") val metaForwardAuth: kotlin.Boolean? = false,
    @SerialName(value = "xKey") val xKey: kotlin.String? = null,
    @SerialName(value = "yKey") val yKey: kotlin.String? = null,
    @SerialName(value = "subtitle") val subtitle: kotlin.String? = null,
    @SerialName(value = "description") val description: kotlin.String? = null
) {

    /**
     * Supported HTTP verbs for external HTTP widgets.
     *
     * @property value Wire string representation of the HTTP method.
     */
    @Serializable
    enum class Method(/** Wire string representation. */ val value: kotlin.String) {
        /** HTTP GET method. */
        @SerialName(value = "GET")
        GET("GET"),

        /** HTTP POST method. */
        @SerialName(value = "POST")
        POST("POST"),

        /** HTTP PUT method. */
        @SerialName(value = "PUT")
        PUT("PUT"),

        /** HTTP DELETE method. */
        @SerialName(value = "DELETE")
        DELETE("DELETE"),

        /** HTTP PATCH method. */
        @SerialName(value = "PATCH")
        PATCH("PATCH")
    }
}
