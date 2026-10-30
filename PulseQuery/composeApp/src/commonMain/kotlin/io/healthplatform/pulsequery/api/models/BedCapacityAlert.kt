/**
 * Real-time hospital unit bed capacity alert payload model.
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
 * Real-time hospital unit capacity alert payload.
 *
 * @property unitCategory Hospital unit or department category name.
 * @property currentCensus Active patient count in the unit.
 * @property maxCapacity Maximum staffed bed capacity of the unit.
 * @property occupancyPercentage Calculated bed occupancy percentage.
 * @property thresholdPercentage Configured alert threshold percentage.
 * @property severity Alert severity classification.
 * @property message Human-readable alert summary message.
 * @property timestamp Instant when the alert was evaluated.
 */
@Serializable
data class BedCapacityAlert(
    @SerialName(value = "unit_category") @Required val unitCategory: kotlin.String,
    @SerialName(value = "current_census") @Required val currentCensus: kotlin.Int,
    @SerialName(value = "max_capacity") @Required val maxCapacity: kotlin.Int,
    @SerialName(value = "occupancy_percentage") @Required val occupancyPercentage: kotlin.Double,
    @SerialName(value = "threshold_percentage") @Required val thresholdPercentage: kotlin.Double,
    @SerialName(value = "severity") @Required val severity: BedCapacityAlert.Severity,
    @SerialName(value = "message") @Required val message: kotlin.String,
    @SerialName(value = "timestamp") @Required val timestamp: kotlin.time.Instant
) {

    /**
     * Severity level of a [BedCapacityAlert].
     *
     * @property value Wire string representation ("INFO", "WARNING", or "CRITICAL").
     */
    @Serializable
    enum class Severity(/** Wire string representation. */ val value: kotlin.String) {
        /** Informational capacity alert. */
        @SerialName(value = "INFO")
        INFO("INFO"),

        /** Warning capacity alert. */
        @SerialName(value = "WARNING")
        WARNING("WARNING"),

        /** Critical capacity alert. */
        @SerialName(value = "CRITICAL")
        CRITICAL("CRITICAL")
    }
}
