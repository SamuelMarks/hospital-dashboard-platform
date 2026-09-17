package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlin.test.*

/**
 * Unit tests for [NetworkHealthRepository] validating connectivity state, database status,
 * and error capture across various health response scenarios.
 */
class NetworkHealthRepositoryTest {

    private val healthySystemResponseJson = """
        {
          "overall_status": "healthy",
          "timestamp": "2026-09-14T12:00:00Z",
          "postgres": {
            "status": "connected",
            "latency_ms": 1.2
          },
          "duckdb": {
            "status": "ready",
            "total_tables": 3,
            "tables": { "hospital_data": 100 }
          },
          "data": {
            "has_default_data": true,
            "fallback_generated": false,
            "missing_files": [],
            "row_counts": { "hospital_data": 100 }
          },
          "templates": {
            "templates_loaded": 10,
            "has_templates": true,
            "missing_file": false
          },
          "llm": {
            "providers_count": 2,
            "mock_mode": false,
            "models": ["gpt-4o"]
          },
          "warnings": []
        }
    """.trimIndent()

    private val degradedDatabaseResponseJson = """
        {
          "overall_status": "critical",
          "timestamp": "2026-09-14T12:00:00Z",
          "postgres": {
            "status": "error",
            "error": "Connection refused"
          },
          "duckdb": {
            "status": "error",
            "error": "DuckDB lock error"
          },
          "data": {
            "has_default_data": false,
            "fallback_generated": false,
            "missing_files": ["hospital_data.csv"],
            "row_counts": {}
          },
          "templates": {
            "templates_loaded": 0,
            "has_templates": false,
            "missing_file": true
          },
          "llm": {
            "providers_count": 0,
            "mock_mode": true,
            "models": []
          },
          "warnings": []
        }
    """.trimIndent()

    private fun configureMockEngine(
        statusCode: HttpStatusCode = HttpStatusCode.OK,
        responseJson: String = healthySystemResponseJson
    ) {
        val mockEngine = MockEngine { request ->
            if (request.url.encodedPath.contains("system/health")) {
                if (statusCode == HttpStatusCode.OK) {
                    respond(
                        content = responseJson,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                } else {
                    respond("Server Error", status = statusCode)
                }
            } else {
                respond("Not Found", status = HttpStatusCode.NotFound)
            }
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @Test
    fun testCheckHealthSuccess() = runTest {
        configureMockEngine(statusCode = HttpStatusCode.OK, responseJson = healthySystemResponseJson)
        val repository = NetworkHealthRepository(systemApi = AppContainer.systemApi, scope = this)

        val result = repository.checkHealth()
        assertTrue(result.isSuccess)
        assertTrue(repository.isOnline.value)
        assertTrue(repository.isDatabaseHealthy.value)
        assertNull(repository.lastError.value)
        assertEquals("healthy", repository.healthState.value?.overallStatus)
    }

    @Test
    fun testCheckHealthOffline() = runTest {
        configureMockEngine(statusCode = HttpStatusCode.ServiceUnavailable)
        val repository = NetworkHealthRepository(systemApi = AppContainer.systemApi, scope = this)

        val result = repository.checkHealth()
        assertFalse(result.isSuccess)
        assertFalse(repository.isOnline.value)
        assertFalse(repository.isDatabaseHealthy.value)
        assertNotNull(repository.lastError.value)
    }

    @Test
    fun testCheckHealthDatabaseDegraded() = runTest {
        configureMockEngine(statusCode = HttpStatusCode.OK, responseJson = degradedDatabaseResponseJson)
        val repository = NetworkHealthRepository(systemApi = AppContainer.systemApi, scope = this)

        val result = repository.checkHealth()
        assertTrue(result.isSuccess)
        assertTrue(repository.isOnline.value) // Server responded
        assertFalse(repository.isDatabaseHealthy.value) // But DB is degraded
        assertEquals("critical", repository.healthState.value?.overallStatus)
    }

    @Test
    fun testCheckHealthPostgresReadyDuckdbConnected() = runTest {
        val json = healthySystemResponseJson
            .replace("\"status\": \"connected\"", "\"status\": \"ready\"")
            .replace("\"status\": \"ready\"", "\"status\": \"connected\"")
        configureMockEngine(statusCode = HttpStatusCode.OK, responseJson = json)
        val repository = NetworkHealthRepository(systemApi = AppContainer.systemApi, scope = this)

        val result = repository.checkHealth()
        assertTrue(result.isSuccess)
        assertTrue(repository.isDatabaseHealthy.value)
    }

    @Test
    fun testCheckHealthDuckdbDegradedOnly() = runTest {
        val json = healthySystemResponseJson
            .replace("\"status\": \"ready\"", "\"status\": \"error\"")
        configureMockEngine(statusCode = HttpStatusCode.OK, responseJson = json)
        val repository = NetworkHealthRepository(systemApi = AppContainer.systemApi, scope = this)

        val result = repository.checkHealth()
        assertTrue(result.isSuccess)
        assertFalse(repository.isDatabaseHealthy.value)
    }

    @Test
    fun testCheckHealthExceptionNullMessage() = runTest {
        val mockEngine = MockEngine { _ ->
            throw RuntimeException()
        }
        val client = HttpClient(mockEngine)
        AppContainer.setHttpClientForTest(client)
        val repository = NetworkHealthRepository(systemApi = AppContainer.systemApi, scope = this)

        val result = repository.checkHealth()
        assertFalse(result.isSuccess)
        assertEquals("Backend unreachable", repository.lastError.value)
    }

    @Test
    fun testRefreshHealthTriggersAsyncCheck() = runTest {
        configureMockEngine(statusCode = HttpStatusCode.OK, responseJson = healthySystemResponseJson)
        val repository = NetworkHealthRepository(systemApi = AppContainer.systemApi, scope = this)

        repository.refreshHealth()
        val online = withTimeout(5000) {
            repository.isOnline.first { it }
        }
        assertTrue(online)
    }
}
