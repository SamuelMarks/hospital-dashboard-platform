package io.healthplatform.pulsequery.network

import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.request.header
import io.ktor.client.request.url
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * Provides the configured Ktor HTTP Client for the application.
 *
 * @param baseUrl The base URL of the Pulse Query backend API.
 * @param engine Optional [io.ktor.client.engine.HttpClientEngine] for test mocking.
 * @param tokenProvider A lambda providing the current authentication token.
 * @param refreshTokenProvider Optional lambda providing the current refresh token.
 * @param onTokenRefreshed Optional callback invoked when tokens are refreshed.
 * @return A fully configured [HttpClient] instance.
 */
fun createHttpClient(
    baseUrl: String = "https://api.pulsequery.com", // Will be overridden via DI / Environment
    engine: io.ktor.client.engine.HttpClientEngine? = null,
    refreshTokenProvider: (() -> String?)? = null,
    onTokenRefreshed: ((String, String?) -> Unit)? = null,
    tokenProvider: () -> String?
): HttpClient {
    val config: io.ktor.client.HttpClientConfig<*>.() -> Unit = {
        expectSuccess = true

        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 15_000
            socketTimeoutMillis = 30_000
        }

        install(WebSockets) {
            pingIntervalMillis = 30_000
        }

        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
                encodeDefaults = true
                explicitNulls = false
            })
        }

        install(Logging) {
            logger = object : Logger {
                override fun log(message: String) {
                    println("HttpClient: $message")
                }
            }
            level = LogLevel.INFO
        }

        defaultRequest {
            url(baseUrl)
            tokenProvider()?.let { token ->
                header(HttpHeaders.Authorization, "Bearer $token")
            }
        }
    }

    return if (engine != null) {
        HttpClient(engine, config)
    } else {
        HttpClient(config)
    }
}
