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
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
import kotlin.test.assertTrue

/**
 * Verifies [AdminScreen] loading, saving, and error handling against a mocked `/api/v1/admin/settings` endpoint.
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

    /**
     * Verifies that [AdminScreen] loads existing API keys and visible models and saves updates cleanly.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAdminScreenInitialLoadAndSave() = runComposeUiTest {
        setupMockApi(successLoad = true, successSave = true)
        var loadedKeyCount = 0

        setContent {
            MaterialTheme {
                val scope = androidx.compose.runtime.rememberCoroutineScope()
                val vm = androidx.compose.runtime.remember(scope) {
                    io.healthplatform.pulsequery.ui.screens.admin.AdminViewModel(scope = scope)
                }
                val state by vm.state.collectAsState()
                loadedKeyCount = state.apiKeys.size
                AdminScreen(viewModel = vm)
            }
        }

        waitUntil(timeoutMillis = 15000) {
            loadedKeyCount == 1 &&
                onAllNodesWithText("API Keys", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("API Keys", substring = true).assertIsDisplayed()
        onNodeWithText("Save Settings", useUnmergedTree = true).performClick()
    }

    /**
     * Verifies that [AdminScreen] renders an error message when loading settings fails.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAdminScreenLoadError() = runComposeUiTest {
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
