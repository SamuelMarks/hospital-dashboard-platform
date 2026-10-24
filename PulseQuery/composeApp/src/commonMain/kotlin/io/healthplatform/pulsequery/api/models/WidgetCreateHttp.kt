/**
 * Request model for creating an external HTTP endpoint dashboard widget.
 */
@file:Suppress(
    "REDUNDANT_CALL_OF_CONVERSION_METHOD",
    "UNNECESSARY_SAFE_CALL",
    "ArrayInDataClass",
    "EnumEntryName",
    "RemoveRedundantQualifierName",
    "UnusedImport"
)

package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.Required
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Payload for creating an HTTP Widget. Strictly enforces `type="HTTP"` and `config` matching [HttpConfig].
 *
 * @property title Display title of the HTTP widget.
 * @property type Widget source discriminator ("HTTP").
 * @property visualization Visualization ID (e.g. 'table', 'metric').
 * @property config HTTP-specific configuration.
 */
@Serializable
data class WidgetCreateHttp(
    @SerialName(value = "title") @Required val title: kotlin.String,
    @SerialName(value = "type") @Required val type: WidgetCreateHttp.Type,
    @SerialName(value = "visualization") @Required val visualization: kotlin.String,
    @SerialName(value = "config") @Required val config: HttpConfig
) {

    /**
     * Discriminator enum for HTTP widget creation.
     *
     * @property value Wire string representation ("HTTP").
     */
    @Serializable
    enum class Type(val value: kotlin.String) {
        /** HTTP widget type discriminator. */
        @SerialName(value = "HTTP")
        HTTP("HTTP")
    }
}
