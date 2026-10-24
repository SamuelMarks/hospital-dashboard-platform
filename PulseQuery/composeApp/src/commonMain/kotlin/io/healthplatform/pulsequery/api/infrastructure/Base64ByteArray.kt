/**
 * Base64-encoded binary byte array wrapper for OpenAPI byte-stream serialization.
 */
package io.healthplatform.pulsequery.api.infrastructure

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlin.io.encoding.Base64

/**
 * Value wrapper around a raw [ByteArray] providing Base64 string serialization and structural equality.
 *
 * @property value Underlying binary byte array content.
 */
@Serializable(Base64ByteArray.Companion::class)
class Base64ByteArray(val value: ByteArray) {
    /**
     * Custom [KSerializer] encoding [Base64ByteArray] instances as Base64 strings.
     */
    companion object : KSerializer<Base64ByteArray> {
        /** Serial descriptor representing [Base64ByteArray] as a primitive string. */
        override val descriptor: SerialDescriptor =
            PrimitiveSerialDescriptor("Base64ByteArray", PrimitiveKind.STRING)

        /**
         * Encodes [value] into its Base64 string representation.
         *
         * @param encoder Target kotlinx.serialization [Encoder].
         * @param value [Base64ByteArray] instance to encode.
         */
        override fun serialize(encoder: Encoder, value: Base64ByteArray) {
            encoder.encodeString(Base64.encode(value.value))
        }

        /**
         * Decodes a Base64 string from [decoder] into a [Base64ByteArray].
         *
         * @param decoder Source kotlinx.serialization [Decoder].
         * @return Decoded [Base64ByteArray] instance.
         */
        override fun deserialize(decoder: Decoder): Base64ByteArray {
            val raw = decoder.decodeString()
            val bytes = runCatching { Base64.decode(raw) }.getOrElse { raw.encodeToByteArray() }
            return Base64ByteArray(bytes)
        }
    }

    /**
     * Checks structural content equality of the underlying [ByteArray].
     *
     * @param other Other object to compare against.
     * @return True if [other] is a [Base64ByteArray] with identical byte contents.
     */
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Base64ByteArray) return false
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
     * Formats the [Base64ByteArray] as a diagnostic hex string.
     *
     * @return Formatted string representation.
     */
    override fun toString(): String {
        return "Base64ByteArray(${value.toHexString()})"
    }
}
