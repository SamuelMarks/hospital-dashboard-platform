/**
 * Request model for creating a static Text / Markdown dashboard widget.
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

/**
 * Payload for creating a Text Widget. Strictly enforces `type="TEXT"` and `config` matching [TextConfig].
 *
 * @property title Display title of the text widget.
 * @property type Widget source discriminator ("TEXT").
 * @property config Text-specific configuration.
 * @property visualization Fixed visualization ID for text ("markdown").
 */
@Serializable
data class WidgetCreateText(
    @SerialName(value = "title") @Required val title: kotlin.String,
    @SerialName(value = "type") @Required val type: WidgetCreateText.Type,
    @SerialName(value = "config") @Required val config: TextConfig,
    @SerialName(value = "visualization") val visualization: WidgetCreateText.Visualization? = Visualization.markdown
) {

    /**
     * Discriminator enum for Text widget creation.
     *
     * @property value Wire string representation ("TEXT").
     */
    @Serializable
    enum class Type(/** Wire string representation. */ val value: kotlin.String) {
        /** Text widget type discriminator. */
        @SerialName(value = "TEXT")
        TEXT("TEXT")
    }

    /**
     * Fixed visualization ID for text widgets.
     *
     * @property value Wire string representation ("markdown").
     */
    @Serializable
    enum class Visualization(/** Wire string representation. */ val value: kotlin.String) {
        /** Markdown visualization type. */
        @SerialName(value = "markdown")
        markdown("markdown")
    }
}
