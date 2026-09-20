package io.healthplatform.pulsequery.core.error

import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.flatMap
import io.healthplatform.pulsequery.core.result.runCatchingPulse
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.core.result.toPulseQueryError
import io.ktor.client.engine.mock.respond
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit tests verifying behavior, mapping logic, and inheritance of [PulseQueryError]
 * and the [Result] percolation extensions.
 */
class PulseQueryErrorTest {

    @Test
    fun testNetworkErrors() {
        val cause = RuntimeException("Connection reset")
        val unreachable = PulseQueryError.Network.Unreachable("api.hospital.internal", cause)
        assertEquals("Backend unreachable at api.hospital.internal", unreachable.message)
        assertEquals(cause, unreachable.cause)
        assertEquals("api.hospital.internal", unreachable.host)

        val timeout = PulseQueryError.Network.Timeout()
        assertEquals("Network request timed out", timeout.message)

        val ws = PulseQueryError.Network.WebSocketFailure("Connection closed prematurely")
        assertEquals("Connection closed prematurely", ws.message)

        val sse = PulseQueryError.Network.SseFailure("Broken pipe")
        assertEquals("Broken pipe", sse.message)
    }

    @Test
    fun testHttpErrors() {
        val badRequest = PulseQueryError.Http.BadRequest("Invalid email parameter")
        assertEquals(400, badRequest.statusCode)
        assertEquals("Invalid email parameter", badRequest.reason)
        assertEquals("HTTP 400: Invalid email parameter", badRequest.message)

        val unauthorized = PulseQueryError.Http.Unauthorized()
        assertEquals(401, unauthorized.statusCode)

        val forbidden = PulseQueryError.Http.Forbidden()
        assertEquals(403, forbidden.statusCode)

        val notFound = PulseQueryError.Http.NotFound("Dashboard")
        assertEquals(404, notFound.statusCode)
        assertEquals("Dashboard not found", notFound.reason)

        val conflict = PulseQueryError.Http.Conflict("Email exists")
        assertEquals(409, conflict.statusCode)

        val serverError = PulseQueryError.Http.ServerError(503, "Service Unavailable")
        assertEquals(503, serverError.statusCode)

        val clientError = PulseQueryError.Http.ClientError(422, "Unprocessable Entity")
        assertEquals(422, clientError.statusCode)
    }

    @Test
    fun testFromHttpStatusMapping() {
        assertIs<PulseQueryError.Http.BadRequest>(PulseQueryError.fromHttpStatus(400, "Bad"))
        assertIs<PulseQueryError.Http.Unauthorized>(PulseQueryError.fromHttpStatus(401))
        assertIs<PulseQueryError.Http.Forbidden>(PulseQueryError.fromHttpStatus(403))
        assertIs<PulseQueryError.Http.NotFound>(PulseQueryError.fromHttpStatus(404, "User"))
        assertIs<PulseQueryError.Http.Conflict>(PulseQueryError.fromHttpStatus(409, "Duplicate"))
        assertIs<PulseQueryError.Http.ServerError>(PulseQueryError.fromHttpStatus(500, "Crash"))
        assertIs<PulseQueryError.Http.ServerError>(PulseQueryError.fromHttpStatus(502, ""))
        assertIs<PulseQueryError.Http.ServerError>(PulseQueryError.fromHttpStatus(599, "Max server error"))
        assertIs<PulseQueryError.Http.ClientError>(PulseQueryError.fromHttpStatus(429, "Rate limited"))
        assertIs<PulseQueryError.Http.ClientError>(PulseQueryError.fromHttpStatus(600, "Custom 600"))
        assertIs<PulseQueryError.Http.ClientError>(PulseQueryError.fromHttpStatus(200, "Ok as client error"))
    }

    @Test
    fun testAuthErrors() {
        val unconfigured = PulseQueryError.Auth.Unconfigured("Bearer")
        assertEquals("No Bearer authentication configured", unconfigured.message)
        assertEquals("Bearer", unconfigured.authType)

        val undefined = PulseQueryError.Auth.Undefined("custom-auth")
        assertEquals("Authentication undefined: custom-auth", undefined.message)
        assertEquals("custom-auth", undefined.authName)

        val expired = PulseQueryError.Auth.SessionExpired()
        assertEquals("Session expired or refresh token invalid", expired.message)

        val unauth = PulseQueryError.Auth.Unauthenticated()
        assertEquals("User is not currently authenticated", unauth.message)
    }

    @Test
    fun testStorageErrors() {
        val dir = PulseQueryError.Storage.DirectoryNotFound("/var/data")
        assertEquals("Directory not found: /var/data", dir.message)
        assertEquals("/var/data", dir.path)

        val write = PulseQueryError.Storage.WriteFailure("report.pdf", "/tmp/report.pdf")
        assertEquals("Failed to write report.pdf to /tmp/report.pdf", write.message)

        val ser = PulseQueryError.Storage.SerializationFailure("WidgetConfig")
        assertEquals("Failed to serialize/deserialize WidgetConfig", ser.message)
    }

    @Test
    fun testCommandErrors() {
        val undo = PulseQueryError.Command.NoUndoAvailable()
        assertEquals("No actions available to undo", undo.message)

        val redo = PulseQueryError.Command.NoRedoAvailable()
        assertEquals("No actions available to redo", redo.message)

        val exec = PulseQueryError.Command.ExecutionFailed("Database locked")
        assertEquals("Command execution failed: Database locked", exec.message)
    }

    @Test
    fun testGeneralAndFromThrowable() {
        val generic = PulseQueryError.General("Something failed")
        assertEquals("Something failed", generic.message)

        val wrapped = PulseQueryError.fromThrowable(generic)
        assertEquals(generic, wrapped)

        val raw = IllegalArgumentException("Invalid argument value")
        val converted = PulseQueryError.fromThrowable(raw)
        assertIs<PulseQueryError.General>(converted)
        assertEquals("Invalid argument value", converted.message)
        assertEquals(raw, converted.cause)

        val nullMsgRaw = RuntimeException()
        val convertedNullMsg = PulseQueryError.fromThrowable(nullMsgRaw)
        assertEquals("Unknown error occurred", convertedNullMsg.message)
    }

    @Test
    fun testFlatMap() {
        val success1: Result<Int> = Result.success(10)
        val flatSuccess = success1.flatMap { Result.success(it * 2) }
        assertTrue(flatSuccess.isSuccess)
        assertEquals(20, flatSuccess.getOrNull())

        val flatFailure = success1.flatMap { Result.failure<Int>(PulseQueryError.General("error")) }
        assertTrue(flatFailure.isFailure)
        assertIs<PulseQueryError.General>(flatFailure.exceptionOrNull())

        val failure1: Result<Int> = Result.failure(PulseQueryError.Auth.Unauthenticated())
        val flatIgnored = failure1.flatMap { Result.success(it * 2) }
        assertTrue(flatIgnored.isFailure)
        assertIs<PulseQueryError.Auth.Unauthenticated>(flatIgnored.exceptionOrNull())
    }

    @Test
    fun testRunCatchingPulse() {
        val ok = runCatchingPulse { "Hello Pulse" }
        assertTrue(ok.isSuccess)
        assertEquals("Hello Pulse", ok.getOrNull())

        val err = runCatchingPulse {
            throw IllegalStateException("Something blew up")
        }
        assertTrue(err.isFailure)
        val pulseError = err.toPulseQueryError()
        assertNotNull(pulseError)
        assertIs<PulseQueryError.General>(pulseError)
        assertEquals("Something blew up", pulseError.message)
    }

    @Test
    fun testRunCatchingPulseAsync() = runTest {
        val ok = runCatchingPulseAsync { "Async success" }
        assertTrue(ok.isSuccess)
        assertEquals("Async success", ok.getOrNull())
        assertNull(ok.toPulseQueryError())

        val err = runCatchingPulseAsync {
            throw PulseQueryError.Network.Timeout()
        }
        assertTrue(err.isFailure)
        val pulseError = err.toPulseQueryError()
        assertNotNull(pulseError)
        assertIs<PulseQueryError.Network.Timeout>(pulseError)
    }

    @Test
    fun testAsResultSuccess() = runTest {
        val dashboardsApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(
            baseUrl = "http://localhost:8000",
            httpClientEngine = io.healthplatform.pulsequery.mockEngine
        )
        val response = dashboardsApi.listDashboardsApiV1DashboardsGet()
        val result = response.asResult()
        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)
        assertEquals("Main", result.getOrNull()?.first()?.name)
    }

    @Test
    fun testAsResultFailure() = runTest {
        val failingEngine = io.ktor.client.engine.mock.MockEngine {
            respond(
                content = """{"detail": "Not authorized"}""",
                status = io.ktor.http.HttpStatusCode.Unauthorized,
                headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json")
            )
        }
        val dashboardsApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(
            baseUrl = "http://localhost:8000",
            httpClientEngine = failingEngine
        )
        val response = dashboardsApi.listDashboardsApiV1DashboardsGet()
        val result = response.asResult()
        assertTrue(result.isFailure)
        val error = result.toPulseQueryError()
        assertNotNull(error)
        assertIs<PulseQueryError.Http.Unauthorized>(error)
        assertEquals(401, error.statusCode)
    }

    @Test
    fun testAsResultSerializationFailure() = runTest {
        val failingEngine = io.ktor.client.engine.mock.MockEngine {
            respond(
                content = """Invalid JSON content""",
                status = io.ktor.http.HttpStatusCode.OK,
                headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json")
            )
        }
        val dashboardsApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(
            baseUrl = "http://localhost:8000",
            httpClientEngine = failingEngine
        )
        val response = dashboardsApi.listDashboardsApiV1DashboardsGet()
        val result = response.asResult()
        assertTrue(result.isFailure)
        val error = result.toPulseQueryError()
        assertNotNull(error)
        assertIs<PulseQueryError.Storage.SerializationFailure>(error)
    }
}
