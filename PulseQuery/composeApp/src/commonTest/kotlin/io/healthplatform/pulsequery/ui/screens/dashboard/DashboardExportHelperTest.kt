/**
 * Unit tests verifying [DashboardExportHelper] export actions and [Result] error handling.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

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
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Unit tests verifying [DashboardExportHelper] export actions and error handling.
 */
class DashboardExportHelperTest {

    /**
     * Resets [AppContainer] before each test case.
     */
    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    /**
     * Resets [AppContainer] after each test case.
     */
    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    /**
     * Verifies JSON dashboard export returns a successful [Result] with [DashboardExportArtifact].
     */
    @Test
    fun testExportDashboardJsonSuccess() = runTest {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("export") -> {
                    respond(
                        """{"id":"dash-1","name":"Main Dashboard"}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)

        val defaultArtifact = DashboardExportArtifact(format = "json")
        assertEquals("", defaultArtifact.content)
        assertEquals(0, defaultArtifact.bytes.size)
        assertEquals("", defaultArtifact.filename)
        assertEquals("application/json", defaultArtifact.mimeType)

        val result = DashboardExportHelper.exportDashboard("dash-1")
        assertTrue(result.isSuccess)
        val artifact = result.getOrThrow()
        assertEquals("json", artifact.format)
        assertEquals("dashboard-dash-1.json", artifact.filename)
        assertEquals("application/json", artifact.mimeType)
        assertTrue(artifact.content.contains("Main Dashboard"))
    }

    /**
     * Verifies CSV dashboard export returns a successful [Result] with CSV MIME type and filename.
     */
    @Test
    fun testExportDashboardCsvSuccess() = runTest {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("export") -> {
                    respond(
                        """
                        widget_id,title,value
                        w-1,Census,42
                        """.trimIndent(),
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, "text/csv")
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)

        val result = DashboardExportHelper.exportDashboard("dash-1", "csv")
        assertTrue(result.isSuccess)
        val artifact = result.getOrThrow()
        assertEquals("csv", artifact.format)
        assertEquals("dashboard-dash-1.csv", artifact.filename)
        assertEquals("text/csv", artifact.mimeType)
        assertTrue(artifact.content.contains("Census"))
    }

    /**
     * Verifies non-2xx and exception failures in [DashboardExportHelper.exportDashboard] return failed [Result]s.
     */
    @Test
    fun testExportDashboardFailure() = runTest {
        val non2xxClient = HttpClient(MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }) {
            expectSuccess = false
        }
        AppContainer.setHttpClientForTest(non2xxClient)

        val result = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("Export failed with HTTP"))

        val errMsgClient = HttpClient(MockEngine {
            throw IllegalStateException("Disk full")
        })
        AppContainer.setHttpClientForTest(errMsgClient)
        val errMsgResult = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertTrue(errMsgResult.isFailure)
        assertEquals("Disk full", errMsgResult.exceptionOrNull()?.message)

        val nullMsgClient = HttpClient(MockEngine {
            throw RuntimeException(null as String?)
        })
        AppContainer.setHttpClientForTest(nullMsgClient)
        val nullMsgResult = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertTrue(nullMsgResult.isFailure)
        assertEquals("Unknown error occurred", nullMsgResult.exceptionOrNull()?.message)
    }

    /**
     * Verifies PDF clinical report export returns a successful [Result] with binary PDF bytes.
     */
    @Test
    fun testExportDashboardPdfSuccess() = runTest {
        val fakePdfBytes = """
            %PDF-1.4
            1 0 obj
            << /Title (Clinical Report) >>
            endobj
            %%EOF
        """.trimIndent().encodeToByteArray()
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("export/pdf") -> {
                    respond(
                        content = fakePdfBytes,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, "application/pdf")
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine)
        AppContainer.setHttpClientForTest(client)

        val result = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertTrue(result.isSuccess)
        val artifact = result.getOrThrow()
        assertEquals("pdf", artifact.format)
        assertEquals("clinical-report-dash-1.pdf", artifact.filename)
        assertEquals("application/pdf", artifact.mimeType)
        assertTrue(artifact.bytes.isNotEmpty())
    }

    /**
     * Verifies non-2xx and exception failures in [DashboardExportHelper.exportDashboardPdf] return failed [Result]s.
     */
    @Test
    fun testExportDashboardPdfFailure() = runTest {
        val non2xxClient = HttpClient(MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }) {
            expectSuccess = false
        }
        AppContainer.setHttpClientForTest(non2xxClient)

        val result = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message.orEmpty().contains("PDF export failed with HTTP"))

        val errMsgClient = HttpClient(MockEngine {
            throw IllegalStateException("PDF renderer error")
        })
        AppContainer.setHttpClientForTest(errMsgClient)
        val errMsgResult = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertTrue(errMsgResult.isFailure)
        assertEquals("PDF renderer error", errMsgResult.exceptionOrNull()?.message)

        val nullMsgClient = HttpClient(MockEngine {
            throw RuntimeException(null as String?)
        })
        AppContainer.setHttpClientForTest(nullMsgClient)
        val nullMsgResult = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertTrue(nullMsgResult.isFailure)
        assertEquals("Unknown error occurred", nullMsgResult.exceptionOrNull()?.message)
    }

    /**
     * Verifies [DashboardExportHelper.saveExportedFile] persists content or wraps storage failures.
     */
    @Test
    fun testSaveExportedFile() {
        AppContainer.keyValueStorage = null
        val resNoStorage = DashboardExportHelper.saveExportedFile("test.json", "{}")
        assertTrue(resNoStorage.isSuccess)

        val storage = io.healthplatform.pulsequery.database.KeyValueStorage(null)
        AppContainer.currentToken = "preset-token"
        AppContainer.keyValueStorage = storage
        AppContainer.currentToken = null
        AppContainer.keyValueStorage = storage
        val resWithStorage = DashboardExportHelper.saveExportedFile("test.json", """{"a":1}""")
        assertTrue(resWithStorage.isSuccess)
        assertEquals("""{"a":1}""", storage.get("export_test.json"))

        val throwingStorage = object : io.healthplatform.pulsequery.database.KeyValueStorage(null) {
            override fun save(key: String, value: String) {
                throw IllegalStateException("Quota exceeded")
            }
        }
        AppContainer.keyValueStorage = throwingStorage
        val resThrowing = DashboardExportHelper.saveExportedFile("fail.json", "{}")
        assertTrue(resThrowing.isFailure)
    }
}
