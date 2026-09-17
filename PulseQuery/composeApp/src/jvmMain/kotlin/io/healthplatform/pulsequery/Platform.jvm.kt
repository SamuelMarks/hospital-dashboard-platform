package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.core.error.PulseQueryError

/**
 * Represents the JVM execution platform metadata.
 *
 * @property name Java runtime version string.
 */
class JVMPlatform : Platform {
    override val name: String = "Java ${System.getProperty("java.version")}"
}

/**
 * Returns the current [JVMPlatform] execution environment instance.
 *
 * @return Active JVM platform descriptor.
 */
actual fun getPlatform(): Platform = JVMPlatform()

/**
 * Returns the default localhost endpoint when running on the JVM desktop target.
 *
 * @return Local backend API base URL string.
 */
actual fun getDefaultLocalHost(): String = "http://localhost:8000"

/**
 * Persists a binary file payload into the JVM user's Downloads directory.
 *
 * @param filename Target file name including extension.
 * @param mimeType Standard MIME type associated with the payload.
 * @param bytes Binary content of the file.
 * @return [Result] containing the absolute local file path on success, or [PulseQueryError.Storage] on failure.
 */
actual fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String> {
    return runCatching {
        val userHome = System.getProperty("user.home")
        val downloadsDir = java.io.File(userHome, "Downloads")
        if (!downloadsDir.exists()) {
            downloadsDir.mkdirs()
        }
        val targetFile = java.io.File(downloadsDir, filename)
        targetFile.writeBytes(bytes)
        targetFile.absolutePath
    }.recoverCatching { error ->
        throw PulseQueryError.Storage.WriteFailure(filename, filename, error)
    }
}
