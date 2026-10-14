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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit tests verifying [DashboardExportHelper] export actions and error handling.
 */
class DashboardExportHelperTest {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

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

        val result = DashboardExportHelper.exportDashboard("dash-1")
        assertTrue(result.success)
        assertEquals("json", result.format)
        assertEquals("dashboard-dash-1.json", result.filename)
        assertEquals("application/json", result.mimeType)
        assertTrue(result.content.contains("Main Dashboard"))
    }

    @Test
    fun testExportDashboardCsvSuccess() = runTest {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("export") -> {
                    respond(
                        "widget_id,title,value\nw-1,Census,42\n",
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
        assertTrue(result.success)
        assertEquals("csv", result.format)
        assertEquals("dashboard-dash-1.csv", result.filename)
        assertTrue(result.content.contains("Census"))
    }

    @Test
    fun testExportDashboardFailure() = runTest {
        // Non-2xx status with expectSuccess = false reaches the !response.success branch
        val non2xxClient = HttpClient(MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }) {
            expectSuccess = false
        }
        AppContainer.setHttpClientForTest(non2xxClient)

        val result = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertFalse(result.success)
        assertEquals("json", result.format)
        assertTrue(result.errorMessage.orEmpty().contains("Export failed with HTTP"))

        // Exception with message
        val errMsgClient = HttpClient(MockEngine {
            throw IllegalStateException("Disk full")
        })
        AppContainer.setHttpClientForTest(errMsgClient)
        val errMsgResult = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertFalse(errMsgResult.success)
        assertEquals("Disk full", errMsgResult.errorMessage)

        // Exception with null message
        val nullMsgClient = HttpClient(MockEngine {
            throw RuntimeException(null as String?)
        })
        AppContainer.setHttpClientForTest(nullMsgClient)
        val nullMsgResult = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertFalse(nullMsgResult.success)
        assertEquals("Failed to export dashboard", nullMsgResult.errorMessage)
    }

    @Test
    fun testExportDashboardPdfSuccess() = runTest {
        val fakePdfBytes = "%PDF-1.4\n1 0 obj\n<< /Title (Clinical Report) >>\nendobj\n%%EOF".encodeToByteArray()
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
        assertTrue(result.success)
        assertEquals("pdf", result.format)
        assertEquals("clinical-report-dash-1.pdf", result.filename)
        assertEquals("application/pdf", result.mimeType)
        assertTrue(result.bytes.isNotEmpty())
    }

    @Test
    fun testExportDashboardPdfFailure() = runTest {
        // Non-2xx status with expectSuccess = false reaches !response.success branch
        val non2xxClient = HttpClient(MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }) {
            expectSuccess = false
        }
        AppContainer.setHttpClientForTest(non2xxClient)

        val result = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertFalse(result.success)
        assertEquals("pdf", result.format)
        assertTrue(result.errorMessage.orEmpty().contains("PDF export failed with HTTP"))

        // Exception with message
        val errMsgClient = HttpClient(MockEngine {
            throw IllegalStateException("PDF renderer error")
        })
        AppContainer.setHttpClientForTest(errMsgClient)
        val errMsgResult = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertFalse(errMsgResult.success)
        assertEquals("PDF renderer error", errMsgResult.errorMessage)

        // Exception with null message
        val nullMsgClient = HttpClient(MockEngine {
            throw RuntimeException(null as String?)
        })
        AppContainer.setHttpClientForTest(nullMsgClient)
        val nullMsgResult = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertFalse(nullMsgResult.success)
        assertEquals("Failed to export dashboard PDF", nullMsgResult.errorMessage)
    }

    @Test
    fun testSaveFileToDevicePlatform() {
        val testBytes = "Sample Report Content".encodeToByteArray()
        val res = io.healthplatform.pulsequery.saveFileToDevice("test-report.pdf", "application/pdf", testBytes)
        assertTrue(res.isSuccess, "saveFileToDevice failed: ${res.exceptionOrNull()?.message}")
    }

    @Test
    fun testSaveExportedFileWithAndWithoutStorageAndFailure() {
        AppContainer.keyValueStorage = null
        val resNoStorage = DashboardExportHelper.saveExportedFile("test.json", "{}")
        assertTrue(resNoStorage.isSuccess)

        val memStorage = io.healthplatform.pulsequery.database.KeyValueStorage()
        AppContainer.keyValueStorage = memStorage
        val resWithStorage = DashboardExportHelper.saveExportedFile("test.json", "{\"a\":1}")
        assertTrue(resWithStorage.isSuccess)
        assertEquals("{\"a\":1}", memStorage.get("export_test.json"))

        val throwingStorage = object : io.healthplatform.pulsequery.database.KeyValueStorage() {
            override fun save(key: String, value: String) {
                throw IllegalStateException("Quota exceeded")
            }
        }
        AppContainer.keyValueStorage = throwingStorage
        val resThrowing = DashboardExportHelper.saveExportedFile("fail.json", "{}")
        assertTrue(resThrowing.isFailure)
    }
}
