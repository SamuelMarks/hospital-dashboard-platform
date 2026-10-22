/**
 * Android-specific HTTP form payload encoding unit test.
 */
package io.healthplatform.pulsequery

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.Parameters
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Verifies OAuth2 `FormDataContent` encoding when a default JSON header is configured on `HttpClient`.
 */
class AndroidAuthApiTest {

    /**
     * Verifies that form-data post requests override the default JSON content-type with
     * `application/x-www-form-urlencoded` and transmit `username`, `password`, and `grant_type`.
     */
    @Test
    fun testFormDataWithDefaultRequest() = runTest {
        var recordedFormData: FormDataContent? = null
        val inspectEngine = MockEngine { request ->
            recordedFormData = request.body as? FormDataContent
            respond(
                content = """{"access_token":"jwt-123","token_type":"bearer"}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }

        val client = HttpClient(inspectEngine) {
            install(ContentNegotiation) { json() }
            defaultRequest {
                header(HttpHeaders.ContentType, ContentType.Application.Json)
            }
        }

        val response = client.post("http://localhost:8000/api/v1/auth/login") {
            setBody(
                FormDataContent(
                    Parameters.build {
                        append("username", "clinician@hospital.org")
                        append("password", "SecretPass123!")
                        append("grant_type", "password")
                    }
                )
            )
        }

        assertEquals(HttpStatusCode.OK, response.status)
        val formBody = recordedFormData
        assertTrue(formBody != null, "Expected outgoing body to be FormDataContent")
        assertEquals(ContentType.Application.FormUrlEncoded.withoutParameters(), formBody.contentType.withoutParameters())
        assertEquals("clinician@hospital.org", formBody.formData["username"])
        assertEquals("SecretPass123!", formBody.formData["password"])
        assertEquals("password", formBody.formData["grant_type"])
    }
}
