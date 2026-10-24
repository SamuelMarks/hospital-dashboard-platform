/**
 * Response model containing ad-hoc SQL query execution results.
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
import kotlinx.serialization.json.JsonObject

/**
 * Response model containing SQL execution results.
 *
 * @property data List of result rows represented as JSON objects.
 * @property columns Ordered list of result column names.
 * @property error Optional error message if SQL execution failed.
 */
@Serializable
data class SQLExecutionResponse(
    @SerialName(value = "data") @Required val data: kotlin.collections.List<JsonObject>,
    @SerialName(value = "columns") @Required val columns: kotlin.collections.List<kotlin.String>,
    @SerialName(value = "error") val error: kotlin.String? = null
)
