package io.healthplatform.pulsequery

/**
 * Represents the current execution platform metadata.
 */
interface Platform {
    /** Name and version of the execution platform. */
    val name: String
}

/**
 * Returns the current platform instance.
 *
 * @return Platform instance for the current target.
 */
expect fun getPlatform(): Platform

/**
 * Returns the default localhost URL for the current platform.
 * E.g., `http://10.0.2.2:8000` for Android emulator, `http://localhost:8000` for others.
 */
expect fun getDefaultLocalHost(): String

/**
 * Persists an exported report or data file directly to the host platform's storage or file system.
 *
 * @param filename File name including extension.
 * @param mimeType MIME type of the file.
 * @param bytes Binary payload of the file.
 * @return Result containing absolute path or status description upon success, or exception on failure.
 */
expect fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String>