/**
 * Compose UI integration tests for [AdminScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Verifies [AdminScreen] loading, saving, helper functions, and error handling against a mocked `/api/v1/admin/settings` endpoint.
 */
class AdminScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    /**
     * Resets [AppContainer] before each test.
     */
    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(successLoad: Boolean = true, successSave: Boolean = true) {
        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath.removeSuffix("/")
            when {
                path.endsWith("/api/v1/admin/settings") && request.method == HttpMethod.Get -> {
                    if (!successLoad) {
                        respond(
                            content = """{"detail":"Admin settings unavailable"}""",
                            status = HttpStatusCode.InternalServerError,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond(
                            content = """{"api_keys":{"openai":"sk-live-***"},"visible_models":["gemini-2.5-pro"]}""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
                path.endsWith("/api/v1/admin/settings") && request.method == HttpMethod.Put -> {
                    if (!successSave) {
                        respond(
                            content = """{"detail":"Failed to write admin settings"}""",
                            status = HttpStatusCode.InternalServerError,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond(
                            content = """{"api_keys":{"openai":"sk-live-***"},"visible_models":["gemini-2.5-pro"]}""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @Test
    fun testAdminHelperFunctions() {
        assertTrue(canAddApiKey("openai", "sk-123"))
        assertFalse(canAddApiKey("", "sk-123"))
        assertFalse(canAddApiKey("openai", "   "))

        assertTrue(canAddVisibleModel("medgemma-27b", listOf("gemini-2.5-pro")))
        assertFalse(canAddVisibleModel("", listOf("gemini-2.5-pro")))
        assertFalse(canAddVisibleModel("gemini-2.5-pro", listOf("gemini-2.5-pro")))

        assertEquals("openai: sk-1...", formatApiKeyPreview("openai", "sk-123456"))
    }

    /**
     * Verifies that [AdminScreen] loads existing API keys and visible models, supports adding/deleting keys and models, and saves updates cleanly.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAdminScreenInitialLoadInteractionsAndSave() = runComposeUiTest {
        setupMockApi(successLoad = true, successSave = true)
        var loadedKeyCount = 0
        var userNavCount = 0

        setContent {
            MaterialTheme {
                val scope = androidx.compose.runtime.rememberCoroutineScope()
                val vm = androidx.compose.runtime.remember(scope) {
                    io.healthplatform.pulsequery.ui.screens.admin.AdminViewModel(scope = scope)
                }
                val state by vm.state.collectAsState()
                loadedKeyCount = state.apiKeys.size
                AdminScreen(
                    onNavigateToUserManagement = { userNavCount++ },
                    viewModel = vm
                )
            }
        }

        waitUntil(timeoutMillis = 15000) {
            loadedKeyCount == 1 &&
                onAllNodesWithText("API Keys", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("API Keys", substring = true).assertIsDisplayed()

        // Navigate to user management via top bar button and card
        onNodeWithText("Users").performClick()
        onNodeWithText("Staff User Management").performClick()
        assertEquals(2, userNavCount)

        // Click Add Key when empty (no-op branch) then with valid provider & key
        onNodeWithContentDescription("Add Key").performClick()
        onNodeWithText("Provider").performTextInput("anthropic")
        onNodeWithText("Key").performTextInput("sk-ant-9999")
        onNodeWithContentDescription("Add Key").performClick()

        // Delete an API key
        onAllNodes(androidx.compose.ui.test.hasContentDescription("Delete Key"))[0].performClick()

        // Click Add Model when empty (no-op branch) then with valid model name
        onNodeWithContentDescription("Add Model").performClick()
        onNodeWithText("Model Name").performTextInput("medgemma-27b")
        onNodeWithContentDescription("Add Model").performClick()

        // Delete a visible model
        onAllNodes(androidx.compose.ui.test.hasContentDescription("Delete Model"))[0].performClick()

        onNodeWithText("Save Settings", useUnmergedTree = true).performClick()
    }

    /**
     * Verifies that [AdminScreen] renders an error message when loading settings fails and supports retry.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAdminScreenLoadErrorAndRetry() = runComposeUiTest {
        setupMockApi(successLoad = false)

        setContent {
            MaterialTheme {
                AdminScreen()
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Admin settings unavailable", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Admin settings unavailable", substring = true).assertIsDisplayed()
        onNodeWithText("Retry").performClick()
    }

    /**
     * Verifies that [AdminScreen] records an error message when saving settings fails.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAdminScreenSaveError() = runComposeUiTest {
        setupMockApi(successLoad = true, successSave = false)
        var capturedError: String? = null
        var loadedKeyCount = 0

        setContent {
            MaterialTheme {
                val scope = androidx.compose.runtime.rememberCoroutineScope()
                val vm = androidx.compose.runtime.remember(scope) {
                    io.healthplatform.pulsequery.ui.screens.admin.AdminViewModel(scope = scope)
                }
                val state by vm.state.collectAsState()
                capturedError = state.errorMessage
                loadedKeyCount = state.apiKeys.size
                AdminScreen(viewModel = vm)
            }
        }

        waitUntil(timeoutMillis = 15000) {
            loadedKeyCount == 1
        }
        onNodeWithText("Save Settings", useUnmergedTree = true).performClick()

        waitUntil(timeoutMillis = 15000) {
            capturedError?.contains("Failed to write admin settings") == true
        }
        assertTrue(capturedError?.contains("Failed to write admin settings") == true)
    }
}
