/**
 * Generated OpenAPI model representing a Text-to-SQL or MPAX What-If benchmark scenario entry.
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
 * Strongly typed OpenAPI schema for a Text-to-SQL or MPAX What-If benchmark scenario entry.
 *
 * @property id Optional scenario UUID string.
 * @property theme Analytical or clinical optimization theme name.
 * @property question Natural language clinical question (SQL benchmark).
 * @property goldSql Ground-truth DuckDB SQL query (SQL benchmark).
 * @property complexity Complexity tier (`'Low'`, `'Medium'`, `'High'`, `'Easy'`, `'Hard'`).
 * @property prompt Natural language scenario prompt (MPAX benchmark).
 * @property scenario Optional scenario identifier or summary label.
 * @property demandData List of clinical service demand objects.
 * @property baseCapacity Unit capacity dictionary.
 * @property expectedMetrics Expected demand/capacity/overflow metrics.
 */
@Serializable
data class BenchmarkScenarioSchema(
    @SerialName(value = "id") val id: kotlin.String? = null,
    @SerialName(value = "theme") val theme: kotlin.String? = null,
    @SerialName(value = "question") val question: kotlin.String? = null,
    @SerialName(value = "gold_sql") val goldSql: kotlin.String? = null,
    @SerialName(value = "complexity") val complexity: kotlin.String? = null,
    @SerialName(value = "prompt") val prompt: kotlin.String? = null,
    @SerialName(value = "scenario") val scenario: kotlin.String? = null,
    @SerialName(value = "demand_data")
    val demandData: kotlin.collections.List<kotlin.collections.Map<kotlin.String, JsonElement>>? = null,
    @SerialName(value = "base_capacity")
    val baseCapacity: kotlin.collections.Map<kotlin.String, kotlin.Double>? = null,
    @SerialName(value = "expected_metrics")
    val expectedMetrics: kotlin.collections.Map<kotlin.String, kotlin.Double>? = null,
)
