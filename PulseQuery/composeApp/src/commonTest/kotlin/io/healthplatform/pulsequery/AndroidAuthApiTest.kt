package io.healthplatform.pulsequery

import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.Parameters
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Android-specific HTTP form payload encoding unit test.
 */
class AndroidAuthApiTest {

    /**
     * Verifies that form-data post requests process properly when client default JSON header is present.
     */
    @Test
    fun testFormDataWithDefaultRequest() = runTest {
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) { json() }
            defaultRequest {
                header(HttpHeaders.ContentType, ContentType.Application.Json)
            }
        }

        val result = runCatching {
            client.post("http://localhost:8000/api/v1/auth/login") {
                setBody(FormDataContent(Parameters.Empty))
            }
        }.onFailure { e ->
            println("ERROR: ${e.message}")
        }

        assertTrue(result.isSuccess)
    }
}
