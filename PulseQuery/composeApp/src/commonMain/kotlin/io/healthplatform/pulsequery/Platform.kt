package io.healthplatform.pulsequery

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform