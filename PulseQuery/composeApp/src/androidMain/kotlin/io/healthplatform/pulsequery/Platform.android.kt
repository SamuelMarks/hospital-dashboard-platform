/**
 * Android platform-specific implementation module for Pulse Query.
 */
package io.healthplatform.pulsequery

import android.os.Build
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.core.result.runCatchingPulse

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
    return if (isRunningOnAndroidEmulator()) {
        "http://10.0.2.2:8000"
    } else {
        "http://localhost:8000"
    }
}

/**
 * Determines whether the current Android runtime is executing inside an emulator.
 *
 * @param fingerprint Build fingerprint string.
 * @param model Build model string.
 * @param manufacturer Build manufacturer string.
 * @param brand Build brand string.
 * @param device Build device string.
 * @param product Build product string.
 * @param hardware Build hardware string.
 * @return True if running on an emulator, false on physical hardware.
 */
internal fun isRunningOnAndroidEmulator(
    fingerprint: String? = Build.FINGERPRINT,
    model: String? = Build.MODEL,
    manufacturer: String? = Build.MANUFACTURER,
    brand: String? = Build.BRAND,
    device: String? = Build.DEVICE,
    product: String? = Build.PRODUCT,
    hardware: String? = Build.HARDWARE
): Boolean {
    return hasEmulatorBuildIdentity(
        fingerprint.orEmpty(),
        model.orEmpty(),
        manufacturer.orEmpty(),
        brand.orEmpty(),
        device.orEmpty()
    ) || hasEmulatorProductOrHardware(product.orEmpty(), hardware.orEmpty())
}

/**
 * Checks [Build] identity properties (fingerprint, model, manufacturer, brand, device) for emulator markers.
 *
 * @param fingerprint Build fingerprint string.
 * @param model Build model string.
 * @param manufacturer Build manufacturer string.
 * @param brand Build brand string.
 * @param device Build device string.
 * @return True if build identity matches known emulator patterns.
 */
internal fun hasEmulatorBuildIdentity(
    fingerprint: String,
    model: String,
    manufacturer: String,
    brand: String,
    device: String
): Boolean {
    val modelTokens = listOf("google_sdk", "Emulator", "Android SDK built for x86")
    return fingerprint.startsWith("generic") ||
        fingerprint.startsWith("unknown") ||
        modelTokens.any { model.contains(it) } ||
        manufacturer.contains("Genymotion") ||
        (brand.startsWith("generic") && device.startsWith("generic"))
}

/**
 * Checks [Build.PRODUCT] and [Build.HARDWARE] properties for emulator markers.
 *
 * @param product Build product string.
 * @param hardware Build hardware string.
 * @return True if product or hardware matches known emulator patterns.
 */
internal fun hasEmulatorProductOrHardware(product: String, hardware: String): Boolean {
    val productTokens = listOf("google_sdk", "sdk_gphone", "sdk_google", "emulator", "simulator")
    val hardwareTokens = listOf("goldfish", "ranchu", "cutf_cvm")
    return productTokens.any { product.contains(it) } ||
        hardwareTokens.any { hardware.contains(it) }
}

/**
 * Resolves the writable directory for Android file exports, preferring [downloadsDir] when
 * available or creatable, and falling back to [tmpDirProp].
 *
 * @param downloadsDir Candidate public Downloads directory.
 * @param tmpDirProp System temporary directory property value.
 * @return Resolved target [java.io.File] directory.
 */
internal fun resolveAndroidTargetDir(
    downloadsDir: java.io.File?,
    tmpDirProp: String? = System.getProperty("java.io.tmpdir")
): java.io.File {
    return if (downloadsDir != null && (downloadsDir.exists() || downloadsDir.mkdirs())) {
        downloadsDir
    } else {
        java.io.File(tmpDirProp ?: "/tmp")
    }
}

/**
 * Persists an exported file to Android's public Downloads directory, falling back to temp cache
 * if external storage is inaccessible.
 *
 * @param filename File name including extension.
 * @param mimeType MIME type of the payload.
 * @param bytes Binary payload of the file.
 * @return [Result] containing absolute path on success, or [PulseQueryError.Storage.WriteFailure] on failure.
 */
actual fun saveFileToDevice(filename: String, mimeType: String, bytes: ByteArray): Result<String> {
    val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(
        android.os.Environment.DIRECTORY_DOWNLOADS
    )
    val targetDir = resolveAndroidTargetDir(downloadsDir)
    val targetFile = java.io.File(targetDir, filename)
    return runCatchingPulse {
        targetFile.writeBytes(bytes)
        targetFile.absolutePath
    }.fold(
        onSuccess = { Result.success(it) },
        onFailure = { error ->
            Result.failure(PulseQueryError.Storage.WriteFailure(filename, targetFile.absolutePath, error))
        }
    )
}
