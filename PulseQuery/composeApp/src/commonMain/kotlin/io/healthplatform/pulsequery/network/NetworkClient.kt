package io.healthplatform.pulsequery.network

import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.header
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.URLProtocol
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * Provides the configured Ktor HTTP Client for the application.
 *
 * @param baseUrl The base URL of the Pulse Query backend API.
 * @param tokenProvider A lambda providing the current authentication token.
 * @return A fully configured [HttpClient] instance.
 */
fun createHttpClient(
    baseUrl: String = "api.pulsequery.com", // Will be overridden via DI / Environment
    tokenProvider: () -> String?
): HttpClient {
    return HttpClient {
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
            url {
                protocol = URLProtocol.HTTPS
                host = baseUrl
            }
            header(HttpHeaders.ContentType, ContentType.Application.Json)
            tokenProvider()?.let { token ->
                header(HttpHeaders.Authorization, "Bearer $token")
            }
        }
    }
}
