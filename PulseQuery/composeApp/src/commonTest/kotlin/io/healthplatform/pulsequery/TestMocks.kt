package io.healthplatform.pulsequery

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.DEFAULT
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.header
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/**
 * Extracts a UTF-8 string representation from a Ktor [OutgoingContent] request body for test assertions.
 */
fun OutgoingContent.readBodyText(): String = when (this) {
    is OutgoingContent.ByteArrayContent -> bytes().decodeToString()
    is FormDataContent -> formData.entries().joinToString("&") { (k, v) -> "$k=${v.joinToString(",")}" }
    else -> toString()
}

/**
 * Creates a Ktor [HttpClient] configured with JSON ContentNegotiation and optional request recording
 * or forced HTTP status error responses (e.g., 400, 401, 403, 404, 500).
 */
fun createInspectingMockEngine(
    forcedStatus: HttpStatusCode? = null,
    forcedErrorBody: String = """{"detail":"Simulated error"}""",
    recordedRequests: MutableList<HttpRequestData>? = null
): MockEngine = MockEngine { request ->
    recordedRequests?.add(request)

    val statusOverride = forcedStatus
        ?: request.headers["X-Force-Status"]?.toIntOrNull()?.let { HttpStatusCode.fromValue(it) }

    if (statusOverride != null) {
        return@MockEngine respond(
            content = forcedErrorBody,
            status = statusOverride,
            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
        )
    }

    when (request.url.encodedPath.removeSuffix("/")) {
        "/api/v1/auth/register" -> {
            val bodyText = request.body.readBodyText()
            if (request.method != HttpMethod.Post || !bodyText.contains("email")) {
                respond(
                    content = """{"detail": "Invalid registration request"}""",
                    status = HttpStatusCode.BadRequest,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = """{"email": "test@test.com", "id": "1", "is_active": true, "is_admin": false}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        "/api/v1/auth/login" -> {
            val bodyString = request.body.readBodyText()
            if (request.method != HttpMethod.Post || bodyString.contains("wrongpassword")) {
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
        "/api/v1/dashboards" -> {
            if (request.method == HttpMethod.Post) {
                respond(
                    content = """{"id": "dash-new", "name": "Created Dashboard", "owner_id": "1", "widgets": []}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = """[{"id": "1", "name": "Main", "owner_id": "1", "widgets": []}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        "/api/v1/analytics/llm" -> respond(
            content = """[{"source":"chat","candidate_id":"cand1","user_id":"u1","user_email":"u1@hospital.org","llm":"gpt-4o","is_selected":true,"created_at":"2026-01-01T00:00:00Z"}]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/conversations" -> {
            if (request.method == HttpMethod.Post) {
                respond(
                    content = """{"id": "1", "title": "Test E2E", "user_id": "1", "created_at": "2023-01-01T00:00:00Z", "updated_at": "2023-01-01T00:00:00Z", "messages": []}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = """[{"id": "1", "title": "Test E2E", "user_id": "1", "created_at": "2023-01-01T00:00:00Z", "updated_at": "2023-01-01T00:00:00Z"}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        "/api/v1/conversations/1/messages" -> {
            if (request.method == HttpMethod.Post) {
                respond(
                    content = """{"id": "1", "conversation_id": "1", "content": "Hello", "role": "user", "created_at": "2023-01-01T00:00:00Z"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = """[{"id": "1", "conversation_id": "1", "content": "Hello", "role": "user", "created_at": "2023-01-01T00:00:00Z"}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        "/api/v1/templates" -> respond(
            content = """[{"id":"tpl-1","title":"ICU Census","sql_template":"SELECT 1","category":"Census"}]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/schema" -> respond(
            content = """[{"table_name":"admissions","columns":[{"name":"id","type":"INTEGER"}]}]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/admin/settings" -> respond(
            content = """{"api_keys": {"openai": "sk-***"}, "visible_models": ["gpt-4o"]}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/simulation/run" -> {
            val bodyText = request.body.readBodyText()
            if (request.method != HttpMethod.Post || !bodyText.contains("demand_source_sql")) {
                respond(
                    content = """{"detail": "Invalid simulation payload"}""",
                    status = HttpStatusCode.BadRequest,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = """{"assignments": [{"Service":"ICU","Unit":"ICU","Patient_Count":15.0}], "status": "optimal", "message": "Simulation executed successfully"}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        "/api/v1/dashboards/1/refresh" -> respond(
            content = """{"w1": {"data": [{"label": "ICU", "value": 12}]}}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/dashboards/1/widgets/1/refresh" -> respond(
            content = """{"data": [{"label": "ICU", "value": 12}]}""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/system/health" -> respond(
            content = """{
                "overall_status": "healthy",
                "timestamp": "2026-09-14T00:00:00Z",
                "postgres": {"status": "healthy"},
                "duckdb": {"status": "ready"},
                "data": {"has_default_data": true, "fallback_generated": false},
                "llm": {"providers_count": 1, "mock_mode": false},
                "templates": {"templates_loaded": 5, "has_templates": true, "missing_file": false},
                "warnings": []
            }""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/benchmarks/sql" -> respond(
            content = """[{"id": "b1", "theme": "Bed Occupancy", "sql": "SELECT 1", "difficulty": "Easy", "description": "Count beds"}]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/benchmarks/mpax" -> respond(
            content = """[{"id": "m1", "title": "Surge Scenario", "difficulty": "Medium", "description": "ICU surge", "target_service": "ICU"}]""",
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, "application/json")
        )
        "/api/v1/mpax-arena/run", "/api/v1/mpax_arena/run" -> {
            val bodyText = request.body.readBodyText()
            if (request.method != HttpMethod.Post || !bodyText.contains("prompt")) {
                respond(
                    content = """{"detail": "Invalid MPAX arena payload"}""",
                    status = HttpStatusCode.BadRequest,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            } else {
                respond(
                    content = """{"experiment_id": "exp-1", "mode": "critic", "candidates": [{"id":"c1","model_name":"gpt-4o","content":"Allocated","is_selected":false}], "ground_truth_mpax": null}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, "application/json")
                )
            }
        }
        else -> respond("Not Found", HttpStatusCode.NotFound)
    }
}

val mockEngine = createInspectingMockEngine()

fun createMockClient(
    engine: MockEngine = mockEngine,
    bearerToken: String? = "fake-token",
    expectSuccess: Boolean = false
) = HttpClient(engine) {
    this.expectSuccess = expectSuccess
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
        if (bearerToken != null) {
            header(HttpHeaders.Authorization, "Bearer $bearerToken")
        }
    }
}
