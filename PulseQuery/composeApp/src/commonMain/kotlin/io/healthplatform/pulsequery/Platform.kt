package io.healthplatform.pulsequery

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform

/**
 * Returns the default localhost URL for the current platform.
 * E.g., `http://10.0.2.2:8000` for Android emulator, `http://localhost:8000` for others.
 */
expect fun getDefaultLocalHost(): String