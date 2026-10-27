/**
 * Generated OpenAPI sealed hierarchy for discriminated widget execution payloads.
 */
@file:Suppress(
    "ArrayInDataClass",
    "EnumEntryName",
    "RemoveRedundantQualifierName",
    "UnusedImport",
)

package io.healthplatform.pulsequery.api.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Discriminated union of all strongly typed widget execution payload models.
 */
@Serializable
sealed class WidgetExecutionPayload {
    /**
     * Strongly typed model for a SQL widget execution payload.
     *
     * @property data List of row dictionaries returned by DuckDB.
     * @property columns Ordered list of column names.
     * @property error Error message if SQL execution failed, else null.
     * @property generatedSql Optional generated or executed SQL string.
     * @property processorUsed Optional processor identifier used.
     * @property naturalText Optional natural language input processed.
     */
    @Serializable
    @SerialName("sql")
    data class SqlExecutionPayload(
        @SerialName(value = "data")
        val data: kotlin.collections.List<kotlin.collections.Map<kotlin.String, JsonElement>> = emptyList(),
        @SerialName(value = "columns")
        val columns: kotlin.collections.List<kotlin.String> = emptyList(),
        @SerialName(value = "error") val error: kotlin.String? = null,
        @SerialName(value = "generated_sql") val generatedSql: kotlin.String? = null,
        @SerialName(value = "processor_used") val processorUsed: kotlin.String? = null,
        @SerialName(value = "natural_text") val naturalText: kotlin.String? = null,
    ) : WidgetExecutionPayload()

    /**
     * Strongly typed model for an HTTP widget execution payload.
     *
     * @property data Parsed JSON or raw text payload returned by the target HTTP endpoint.
     * @property status HTTP status code or status string.
     * @property error Error message if the HTTP request failed, else null.
     */
    @Serializable
    @SerialName("http")
    data class HttpExecutionPayload(
        @SerialName(value = "data") val data: JsonElement? = null,
        @SerialName(value = "status") val status: kotlin.Int = 200,
        @SerialName(value = "error") val error: kotlin.String? = null,
    ) : WidgetExecutionPayload()

    /**
     * Strongly typed model for a static TEXT/Markdown widget execution payload.
     *
     * @property status Fixed success status string.
     * @property data Always null for static text widgets.
     * @property error Always null for static text widgets.
     */
    @Serializable
    @SerialName("text")
    data class TextExecutionPayload(
        @SerialName(value = "status") val status: kotlin.String = "success",
        @SerialName(value = "data") val data: JsonElement? = null,
        @SerialName(value = "error") val error: kotlin.String? = null,
    ) : WidgetExecutionPayload()

    /**
     * Strongly typed model for a widget execution error payload.
     *
     * @property error Human-readable execution error message.
     * @property data Optional empty data array for client compatibility.
     * @property columns Optional empty columns array for client compatibility.
     * @property generatedSql Optional generated SQL snippet if available.
     * @property processorUsed Optional processor identifier used.
     * @property naturalText Optional natural language input processed.
     */
    @Serializable
    @SerialName("error")
    data class ErrorExecutionPayload(
        @SerialName(value = "error") val error: kotlin.String,
        @SerialName(value = "data") val data: JsonElement? = null,
        @SerialName(value = "columns") val columns: kotlin.collections.List<kotlin.String>? = null,
        @SerialName(value = "generated_sql") val generatedSql: kotlin.String? = null,
        @SerialName(value = "processor_used") val processorUsed: kotlin.String? = null,
        @SerialName(value = "natural_text") val naturalText: kotlin.String? = null,
    ) : WidgetExecutionPayload()
}
