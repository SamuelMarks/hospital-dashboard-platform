/**
 * Unit and Compose UI tests for [DashboardShareDialog], [DashboardShareViewModel], and [DashboardShareState].
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.models.DashboardShareResponse
import io.healthplatform.pulsequery.awaitIdle
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Compose UI and ViewModel tests verifying loading collaborators, inviting new users, revoking shares, and error handling.
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

    private fun createClient(engine: MockEngine): HttpClient = HttpClient(engine) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; isLenient = true })
        }
    }

    /**
     * Sets up mock HTTP engine for dashboard sharing endpoints.
     *
     * @param shouldSucceed Whether operations should succeed.
     */
    private fun setupMockApi(shouldSucceed: Boolean = true) {
        val shares = mutableListOf(
            """{"id":"s-1","dashboard_id":"dash-1","user_id":"u-2","user_email":"doctor@hospital.org","permission_level":"VIEW"}"""
        )

        val mockEngine = createUnconfinedMockEngine { request ->
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

    @Test
    fun testDashboardShareStateAndViewModelAllBranches() = runBlocking {
        val sampleShare = DashboardShareResponse(
            id = "s-1",
            dashboardId = "dash-1",
            userId = "u-1",
            userEmail = "clinician@hospital.org",
            permissionLevel = "VIEW"
        )
        val initialState = DashboardShareState(
            shares = listOf(sampleShare),
            isLoading = false,
            isInviting = false,
            error = "err",
            inviteEmail = "a@b.com",
            selectedPermission = "EDIT"
        )
        assertEquals(1, initialState.shares.size)
        assertFalse(initialState.isLoading)
        assertFalse(initialState.isInviting)
        assertEquals("err", initialState.error)
        assertEquals("a@b.com", initialState.inviteEmail)
        assertEquals("EDIT", initialState.selectedPermission)

        val scope = CoroutineScope(Dispatchers.Unconfined)
        val existingVm = DashboardShareViewModel(dashboardId = "dash-1", scope = scope)
        assertSame(existingVm, resolveDashboardShareViewModel("dash-1", existingVm, scope))
        val createdVm = resolveDashboardShareViewModel("dash-1", null, scope)
        assertTrue(createdVm !== existingVm)

        // Blank email guard
        existingVm.updateInviteEmail("   ")
        existingVm.inviteUser()
        assertFalse(existingVm.state.value.isInviting)

        // Explicit API success flow
        setupMockApi(shouldSucceed = true)
        val explicitApi = DashboardsApi(baseUrl = "http://localhost", httpClient = AppContainer.httpClient)
        val vmSuccess = DashboardShareViewModel(
            dashboardId = "dash-1",
            scope = this,
            dashboardsApi = explicitApi
        )
        vmSuccess.loadShares()
        awaitIdle()
        assertEquals(1, vmSuccess.state.value.shares.size)
        assertNull(vmSuccess.state.value.error)

        vmSuccess.updatePermission("EDIT")
        vmSuccess.updateInviteEmail("  nurse@hospital.org  ")
        vmSuccess.inviteUser()
        awaitIdle()
        assertEquals(2, vmSuccess.state.value.shares.size)
        assertEquals("", vmSuccess.state.value.inviteEmail)

        vmSuccess.revokeShare("s-1")
        awaitIdle()
        assertTrue(vmSuccess.state.value.shares.isEmpty())

        // Default API failure flow
        val failEngine = createUnconfinedMockEngine {
            throw IllegalStateException("Backend share failure")
        }
        AppContainer.setHttpClientForTest(createClient(failEngine))
        val vmFail = DashboardShareViewModel(dashboardId = "dash-1", scope = this)
        vmFail.loadShares()
        awaitIdle()
        assertEquals("Backend share failure", vmFail.state.value.error)
        assertFalse(vmFail.state.value.isLoading)

        vmFail.updateInviteEmail("test@hospital.org")
        vmFail.inviteUser()
        awaitIdle()
        assertEquals("Backend share failure", vmFail.state.value.error)
        assertFalse(vmFail.state.value.isInviting)

        vmFail.revokeShare("s-1")
        awaitIdle()
        assertEquals("Backend share failure", vmFail.state.value.error)
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

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("doctor@hospital.org").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("doctor@hospital.org").assertExists()
        onNodeWithText("Permission: VIEW").assertExists()

        // Invite a new user
        onNodeWithText("Collaborator Email").performTextInput("nurse@hospital.org")
        onNodeWithText("Edit").performClick()
        onNodeWithText("Invite").performClick()

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("nurse@hospital.org").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("nurse@hospital.org").assertExists()

        // Dismiss
        onNodeWithText("Done").performClick()
        waitForIdle()
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

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("doctor@hospital.org").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithContentDescription("Revoke access for doctor@hospital.org").performClick()

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("No collaborators shared yet.").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("No collaborators shared yet.").assertExists()
    }
}
