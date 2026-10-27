/**
 * Generated OpenAPI model representing a single-widget refresh request payload.
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
 * Strongly typed request payload for refreshing a single widget (`POST /dashboards/{id}/widgets/{wid}/refresh`).
 *
 * @property globalParams Optional nested global filter parameters dictionary.
 * @property naturalText Optional user-entered natural language prompt or raw SQL query.
 * @property processor Optional processor override (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`).
 * @property dept Optional clinical department filter shorthand.
 * @property department Optional department filter shorthand.
 * @property service Optional clinical service filter shorthand.
 * @property startDate Optional start date filter shorthand (`YYYY-MM-DD`).
 * @property endDate Optional end date filter shorthand (`YYYY-MM-DD`).
 * @property unit Optional hospital unit filter shorthand.
 */
@Serializable
data class WidgetRefreshRequest(
    @SerialName(value = "global_params")
    val globalParams: kotlin.collections.Map<kotlin.String, JsonElement>? = null,
    @SerialName(value = "natural_text") val naturalText: kotlin.String? = null,
    @SerialName(value = "processor") val processor: kotlin.String? = null,
    @SerialName(value = "dept") val dept: kotlin.String? = null,
    @SerialName(value = "department") val department: kotlin.String? = null,
    @SerialName(value = "service") val service: kotlin.String? = null,
    @SerialName(value = "start_date") val startDate: kotlin.String? = null,
    @SerialName(value = "end_date") val endDate: kotlin.String? = null,
    @SerialName(value = "unit") val unit: kotlin.String? = null,
)
