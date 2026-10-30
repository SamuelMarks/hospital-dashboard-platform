/**
 * Severity classification model for hospital bed occupancy alerts.
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

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Severity classification for bed occupancy alerts.
 *
 * @property value Wire string representation of the severity level.
 */
@Serializable
enum class AlertSeverity(/** Wire string representation. */ val value: kotlin.String) {

    /** Informational occupancy alert level. */
    @SerialName(value = "INFO")
    INFO("INFO"),

    /** Warning occupancy alert level approaching capacity threshold. */
    @SerialName(value = "WARNING")
    WARNING("WARNING"),

    /** Critical occupancy alert level exceeding capacity threshold. */
    @SerialName(value = "CRITICAL")
    CRITICAL("CRITICAL");

    /**
     * Returns the wire string representation of this [AlertSeverity].
     *
     * @return Wire value string.
     */
    override fun toString(): kotlin.String = value

    /**
     * Companion encoding and decoding utilities for [AlertSeverity].
     */
    companion object {
        /**
         * Converts the provided [data] to a [String] on success, null otherwise.
         *
         * @property data Candidate [AlertSeverity] instance.
         * @return Wire string or null.
         */
        fun encode(data: AlertSeverity?): kotlin.String? = data?.value

        /**
         * Returns a valid [AlertSeverity] for [data], null otherwise.
         *
         * @property data Raw wire string or enum representation.
         * @return Matching [AlertSeverity] or null.
         */
        fun decode(data: kotlin.String?): AlertSeverity? = data?.let { raw ->
            val normalizedData = raw.lowercase()
            entries.firstOrNull { entry ->
                raw == entry.value || normalizedData == entry.value.lowercase()
            }
        }
    }
}
