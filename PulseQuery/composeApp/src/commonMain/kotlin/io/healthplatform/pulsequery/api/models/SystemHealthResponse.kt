/**
 * Aggregated system health response schema for PostgreSQL, DuckDB, templates, and LLM providers.
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
 * Schema for aggregated system health response.
 *
 * @property overallStatus Overall health status: healthy, degraded, or critical.
 * @property timestamp ISO timestamp of health assessment.
 * @property postgres Relational database health.
 * @property duckdb OLAP analytics database health.
 * @property data Data readiness and ingestion health.
 * @property templates Template registry health.
 * @property llm LLM provider configuration health.
 * @property warnings Active diagnostic warnings.
 */
@Serializable
data class SystemHealthResponse(
    @SerialName(value = "overall_status") @Required val overallStatus: kotlin.String,
    @SerialName(value = "timestamp") @Required val timestamp: kotlin.String,
    @SerialName(value = "postgres") @Required val postgres: PostgresHealthSchema,
    @SerialName(value = "duckdb") @Required val duckdb: DuckDbHealthSchema,
    @SerialName(value = "data") @Required val data: DataHealthSchema,
    @SerialName(value = "templates") @Required val templates: TemplateHealthSchema,
    @SerialName(value = "llm") @Required val llm: LlmHealthSchema,
    @SerialName(value = "warnings") val warnings: kotlin.collections.List<DiagnosticWarningSchema>? = null
)
