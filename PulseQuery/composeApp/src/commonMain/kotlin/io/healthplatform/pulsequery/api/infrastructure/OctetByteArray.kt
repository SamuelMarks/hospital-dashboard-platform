/**
 * Hex-encoded binary byte array wrapper for OpenAPI octet-stream serialization.
 */
package io.healthplatform.pulsequery.api.infrastructure

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Value wrapper around a raw [ByteArray] providing hex-string serialization and structural equality.
 *
 * @property value Underlying binary byte array content.
 */
@Serializable(OctetByteArray.Companion::class)
class OctetByteArray(val value: ByteArray) {
    /**
     * Custom [KSerializer] encoding [OctetByteArray] instances as lowercase hexadecimal strings.
     */
    companion object : KSerializer<OctetByteArray> {
        /** Serial descriptor representing [OctetByteArray] as a primitive string. */
        override val descriptor: SerialDescriptor =
            PrimitiveSerialDescriptor("OctetByteArray", PrimitiveKind.STRING)

        /**
         * Encodes [value] into its hexadecimal string representation.
         *
         * @param encoder Target kotlinx.serialization [Encoder].
         * @param value [OctetByteArray] instance to encode.
         */
        override fun serialize(encoder: Encoder, value: OctetByteArray) {
            encoder.encodeString(value.value.toHexString())
        }

        /**
         * Decodes a hexadecimal string from [decoder] into an [OctetByteArray], falling back to UTF-8 bytes
         * if the input string is not valid hexadecimal so no uncaught exception is thrown.
         *
         * @param decoder Source kotlinx.serialization [Decoder].
         * @return Decoded [OctetByteArray] instance.
         */
        override fun deserialize(decoder: Decoder): OctetByteArray {
            val raw = decoder.decodeString()
            val bytes = runCatching { raw.hexToByteArray() }.getOrElse { raw.encodeToByteArray() }
            return OctetByteArray(bytes)
        }
    }

    /**
     * Checks structural content equality of the underlying [ByteArray].
     *
     * @param other Other object to compare against.
     * @return True if [other] is an [OctetByteArray] with identical byte contents.
     */
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is OctetByteArray) return false
        return value.contentEquals(other.value)
    }

    /**
     * Computes a content-based hash code for the underlying [ByteArray].
     *
     * @return Content hash code integer.
     */
    override fun hashCode(): Int {
        return value.contentHashCode()
    }

    /**
     * Formats the [OctetByteArray] as a diagnostic hex string.
     *
     * @return Formatted string representation.
     */
    override fun toString(): String {
        return "OctetByteArray(${value.toHexString()})"
    }
}
