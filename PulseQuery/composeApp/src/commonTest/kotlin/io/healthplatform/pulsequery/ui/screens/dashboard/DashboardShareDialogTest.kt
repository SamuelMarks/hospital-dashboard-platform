/**
 * Unit tests for the DashboardShareDialog component.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Compose UI tests verifying loading collaborators, inviting new users, and revoking shares.
 */
class DashboardShareDialogTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    /**
     * Sets up mock HTTP engine for dashboard sharing endpoints.
     *
     * @param shouldSucceed Whether operations should succeed.
     */
    private fun setupMockApi(shouldSucceed: Boolean = true) {
        var shares = mutableListOf(
            """{"id":"s-1","dashboard_id":"dash-1","user_id":"u-2","user_email":"doctor@hospital.org","permission_level":"VIEW"}"""
        )

        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.contains("system/health") -> {
                    respond(
                        """{"overall_status":"healthy","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, "application/json")
                    )
                }
                !shouldSucceed -> {
                    respond("Server Error", HttpStatusCode.InternalServerError)
                }
                request.method.value == "GET" && path.contains("/shares") -> {
                    val body = "[${shares.joinToString(",")}]"
                    respond(body, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
                request.method.value == "POST" && path.contains("/shares") -> {
                    val newShare = """{"id":"s-2","dashboard_id":"dash-1","user_id":"u-3","user_email":"nurse@hospital.org","permission_level":"EDIT"}"""
                    shares.add(newShare)
                    respond(newShare, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
                }
                request.method.value == "DELETE" && path.contains("/shares") -> {
                    shares.clear()
                    respond("", HttpStatusCode.NoContent)
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
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testShareDialogLoadAndInvite() = runComposeUiTest {
        setupMockApi(shouldSucceed = true)
        var dismissed = false

        setContent {
            MaterialTheme {
                DashboardShareContent(
                    dashboardId = "dash-1",
                    onDismiss = { dismissed = true }
                )
            }
        }

        waitUntil(timeoutMillis = 5000) {
            onAllNodesWithText("doctor@hospital.org").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("doctor@hospital.org").assertExists()
        onNodeWithText("Permission: VIEW").assertExists()

        // Invite a new user
        onNodeWithText("Collaborator Email").performTextInput("nurse@hospital.org")
        onNodeWithText("Edit").performClick()
        onNodeWithText("Invite").performClick()

        waitUntil(timeoutMillis = 5000) {
            onAllNodesWithText("nurse@hospital.org").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("nurse@hospital.org").assertExists()

        // Dismiss
        onNodeWithText("Done").performClick()
        assertTrue(dismissed)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testShareDialogRevokeShare() = runComposeUiTest {
        setupMockApi(shouldSucceed = true)

        setContent {
            MaterialTheme {
                DashboardShareContent(
                    dashboardId = "dash-1",
                    onDismiss = {}
                )
            }
        }

        waitUntil(timeoutMillis = 5000) {
            onAllNodesWithText("doctor@hospital.org").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithContentDescription("Revoke access for doctor@hospital.org").performClick()

        waitUntil(timeoutMillis = 5000) {
            onAllNodesWithText("No collaborators shared yet.").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("No collaborators shared yet.").assertExists()
    }
}
