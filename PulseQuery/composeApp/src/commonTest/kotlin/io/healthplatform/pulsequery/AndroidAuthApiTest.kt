package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.infrastructure.ApiClient
import io.healthplatform.pulsequery.network.createHttpClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.request.header
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.Parameters
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

class AndroidAuthApiTest {
    @Test
    fun testFormDataWithDefaultRequest() = runTest {
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) { json() }
            defaultRequest {
                header(HttpHeaders.ContentType, ContentType.Application.Json)
            }
        }
        
        try {
            client.post("http://localhost:8000/api/v1/auth/login") {
                setBody(FormDataContent(Parameters.Empty))
            }
            println("SUCCESS")
        } catch (e: Exception) {
            println("ERROR: ${e.message}")
            e.printStackTrace()
            throw e
        }
    }
}
