package io.healthplatform.pulsequery

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.*
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

val mockEngine = MockEngine { request ->
    when (request.url.encodedPath.removeSuffix("/")) {
        "/api/v1/auth/register" -> respond(
            content = """{"email": "test@test.com", "id": "1", "is_active": true, "is_admin": false}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/auth/login" -> {
            val bodyContent = request.body
            val bodyString = if (bodyContent is io.ktor.client.request.forms.FormDataContent) {
                bodyContent.formData.toString()
            } else {
                bodyContent.toString()
            }
            if (bodyString.contains("wrongpassword")) {
                respond(
                    content = """{"detail": "Incorrect username or password"}""",
                    status = HttpStatusCode.Unauthorized,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = """{"access_token": "fake-token", "token_type": "bearer"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        "/api/v1/auth/me" -> respond(
            content = """{"email": "test@test.com", "id": "1", "is_active": true, "is_admin": false}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/dashboards" -> respond(
            content = """[{"id": "1", "name": "Main", "owner_id": "1", "widgets": []}]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/analytics/llm" -> respond(
            content = """[]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/conversations" -> respond(
            content = """{"id": "1", "title": "Test E2E", "user_id": "1", "created_at": "2023-01-01T00:00:00Z", "updated_at": "2023-01-01T00:00:00Z"}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/conversations/1/messages" -> respond(
            content = """{"id": "1", "conversation_id": "1", "content": "Hello", "role": "user", "created_at": "2023-01-01T00:00:00Z"}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/templates" -> respond(
            content = """[]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/schema" -> respond(
            content = """[]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        else -> respond("Not Found", HttpStatusCode.NotFound)
    }
}

fun createMockClient() = HttpClient(mockEngine) {
    install(ContentNegotiation) {
        json(Json {
            ignoreUnknownKeys = true
            isLenient = true
        })
    }
    install(Logging) {
        logger = Logger.DEFAULT
        level = LogLevel.ALL
    }
    defaultRequest {
        header(HttpHeaders.Authorization, "Bearer fake-token")
    }
}
