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

        val result = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertTrue(result.success)
        assertEquals("json", result.format)
        assertEquals("dashboard-dash-1.json", result.filename)
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
        val mockEngine = MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }
        val client = HttpClient(mockEngine)
        AppContainer.setHttpClientForTest(client)

        val result = DashboardExportHelper.exportDashboard("dash-1", "json")
        assertFalse(result.success)
        assertEquals("json", result.format)
        assertNotNull(result.errorMessage)
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
        val mockEngine = MockEngine {
            respond("Internal Server Error", HttpStatusCode.InternalServerError)
        }
        val client = HttpClient(mockEngine)
        AppContainer.setHttpClientForTest(client)

        val result = DashboardExportHelper.exportDashboardPdf("dash-1")
        assertFalse(result.success)
        assertEquals("pdf", result.format)
        assertNotNull(result.errorMessage)
    }

    @Test
    fun testSaveFileToDevicePlatform() {
        val testBytes = "Sample Report Content".encodeToByteArray()
        val res = io.healthplatform.pulsequery.saveFileToDevice("test-report.pdf", "application/pdf", testBytes)
        assertTrue(res.isSuccess)
    }

    @Test
    fun testSaveExportedFileWithoutStorage() {
        AppContainer.keyValueStorage = null
        val res = DashboardExportHelper.saveExportedFile("test.json", "{}")
        assertTrue(res.isSuccess)
    }
}
