/**
 * Android platform-specific implementation module for Pulse Query.
 */
package io.healthplatform.pulsequery

import android.os.Build
import io.healthplatform.pulsequery.core.error.PulseQueryError

/**
 * Represents the Android execution platform metadata.
 *
 * @property name Android SDK version string.
 */
class AndroidPlatform : Platform {
    override val name: String = "Android ${Build.VERSION.SDK_INT}"
}

/**
 * Returns the current [AndroidPlatform] descriptor.
 *
 * @return Active Android platform descriptor.
 */
actual fun getPlatform(): Platform = AndroidPlatform()

/**
 * Resolves the default backend localhost endpoint.
 * Android emulators route localhost to 10.0.2.2 to reach the host machine loopback.
 *
 * @return Default API base URL string.
 */
actual fun getDefaultLocalHost(): String {
    val fingerprint = Build.FINGERPRINT ?: ""
    val model = Build.MODEL ?: ""
    val manufacturer = Build.MANUFACTURER ?: ""
    val brand = Build.BRAND ?: ""
    val device = Build.DEVICE ?: ""
    val product = Build.PRODUCT ?: ""
    val hardware = Build.HARDWARE ?: ""

    val isEmulator = fingerprint.startsWith("generic") ||
            fingerprint.startsWith("unknown") ||
            model.contains("google_sdk") ||
            model.contains("Emulator") ||
            model.contains("Android SDK built for x86") ||
            manufacturer.contains("Genymotion") ||
            (brand.startsWith("generic") && device.startsWith("generic")) ||
            "google_sdk" == product ||
            product.contains("sdk_gphone") ||
            product.contains("sdk_google") ||
            product.contains("emulator") ||
            product.contains("simulator") ||
            hardware.contains("goldfish") ||
            hardware.contains("ranchu") ||
            hardware.contains("cutf_cvm")

    return if (isEmulator) {
        "http://10.0.2.2:8000"
    } else {
        "http://localhost:8000"
    }
}

/**
 * Persists an exported file to Android's public Downloads directory, falling back to temp cache
 * if external storage is inaccessible.
 *
 * @param filename File name including extension.
 * @param mimeType MIME type of the payload.
 * @param bytes Binary payload of the file.
 * @return [Result] containing absolute path or exception.
 */
actual fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String> {
    val downloadsDir = runCatching {
        android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
    }.getOrNull()
    val targetDir = if (downloadsDir != null && (downloadsDir.exists() || downloadsDir.mkdirs())) {
        downloadsDir
    } else {
        java.io.File(System.getProperty("java.io.tmpdir") ?: "/tmp")
    }
    val targetFile = java.io.File(targetDir, filename)
    return runCatching {
        targetFile.writeBytes(bytes)
        targetFile.absolutePath
    }.recoverCatching { error ->
        throw PulseQueryError.Storage.WriteFailure(filename, targetFile.absolutePath, error)
    }
}
