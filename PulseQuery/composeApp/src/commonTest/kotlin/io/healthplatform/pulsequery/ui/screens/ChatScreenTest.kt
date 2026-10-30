/**
 * Compose UI integration tests for [ChatScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
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

/**
 * Verifies [ChatScreen] conversation loading, message display, and error states.
 */
class ChatScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    /**
     * Resets [AppContainer] state prior to each test.
     */
    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(successLoad: Boolean = true, successCreate: Boolean = true) {
        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath.removeSuffix("/")
            when {
                path.endsWith("/api/v1/conversations") && request.method == HttpMethod.Get -> {
                    if (!successLoad) {
                        respond(
                            content = """{"detail":"Failed to load conversations from DB"}""",
                            status = HttpStatusCode.InternalServerError,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond(
                            content = """[{
                                "id": "conv-1",
                                "title": "NICU Bed Utilization",
                                "user_id": "u-1",
                                "created_at": "2026-09-01T00:00:00Z",
                                "updated_at": "2026-09-01T00:00:00Z"
                            }]""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
                path.endsWith("/api/v1/conversations") && request.method == HttpMethod.Post -> {
                    if (!successCreate) {
                        respond("Create error", HttpStatusCode.InternalServerError)
                    } else {
                        respond(
                            content = """{
                                "id": "conv-2",
                                "title": "New Chat",
                                "user_id": "u-1",
                                "created_at": "2026-09-01T00:00:00Z",
                                "updated_at": "2026-09-01T00:00:00Z",
                                "messages": []
                            }""",
                            status = HttpStatusCode.OK,
                            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
                path.contains("/messages") && request.method == HttpMethod.Get -> {
                    respond(
                        content = """[{
                            "id": "msg-1",
                            "conversation_id": "conv-1",
                            "role": "assistant",
                            "content": "Here is the NICU census query.",
                            "sql_snippet": "SELECT * FROM nicu_census",
                            "created_at": "2026-09-01T00:01:00Z",
                            "candidates": []
                        }]""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
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
     * Verifies that [ChatScreen] loads conversations and selects an initial conversation to display its messages.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testChatScreenInitialAndSelect() = runComposeUiTest {
        setupMockApi(successLoad = true, successCreate = true)

        setContent {
            MaterialTheme {
                ChatScreen(conversationId = "conv-1")
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Here is the NICU census query.", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Here is the NICU census query.", substring = true).assertIsDisplayed()
    }

    /**
     * Verifies that [ChatScreen] displays an error notification when loading conversations fails.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testChatScreenLoadError() = runComposeUiTest {
        setupMockApi(successLoad = false, successCreate = false)

        setContent {
            MaterialTheme {
                ChatScreen()
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Failed to load conversations", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Failed to load conversations", substring = true).assertIsDisplayed()
    }
}
