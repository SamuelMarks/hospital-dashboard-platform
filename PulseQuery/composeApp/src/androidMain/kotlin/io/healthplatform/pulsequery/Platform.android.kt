package io.healthplatform.pulsequery

import android.os.Build

class AndroidPlatform : Platform {
    override val name: String = "Android ${Build.VERSION.SDK_INT}"
}

actual fun getPlatform(): Platform = AndroidPlatform()

/**
 * Android emulators route localhost/127.0.0.1 to their own internal loopback.
 * 10.0.2.2 routes back to the host machine's loopback interface.
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
        // Use standard localhost fallback, though typical deployments use an IP for testing
        "http://localhost:8000"
    }
}