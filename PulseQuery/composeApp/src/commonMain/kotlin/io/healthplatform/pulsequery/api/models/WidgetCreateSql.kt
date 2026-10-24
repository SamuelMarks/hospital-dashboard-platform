/**
 * Request model for creating a SQL-backed dashboard widget.
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
 * Payload for creating a SQL Widget. Strictly enforces `type="SQL"` and `config` matching [SqlConfig].
 *
 * @property title Display title of the widget.
 * @property type Widget source discriminator.
 * @property visualization Visualization ID (e.g. 'table', 'bar_chart').
 * @property config SQL-specific configuration.
 */
@Serializable
data class WidgetCreateSql(
    @SerialName(value = "title") @Required val title: kotlin.String,
    @SerialName(value = "type") @Required val type: WidgetCreateSql.Type,
    @SerialName(value = "visualization") @Required val visualization: kotlin.String,
    @SerialName(value = "config") @Required val config: SqlConfig
) {

    /**
     * Discriminator enum for SQL widget creation.
     *
     * @property value Wire string representation ("SQL").
     */
    @Serializable
    enum class Type(val value: kotlin.String) {
        /** SQL widget type discriminator. */
        @SerialName(value = "SQL")
        SQL("SQL")
    }
}
