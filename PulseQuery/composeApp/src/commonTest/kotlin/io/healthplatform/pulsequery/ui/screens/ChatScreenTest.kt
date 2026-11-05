/**
 * Compose UI integration tests for [ChatScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.models.ConversationResponse
import io.healthplatform.pulsequery.api.models.MessageCandidateResponse
import io.healthplatform.pulsequery.api.models.MessageResponse
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.chat.ChatViewModel
import io.ktor.client.HttpClient
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
import kotlin.test.assertSame
import kotlin.test.assertTrue

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
        val mockEngine = createUnconfinedMockEngine { request ->
            val path = request.url.encodedPath.removeSuffix("/")
            when {
                path.endsWith("/api/v1/ai/models") && request.method == HttpMethod.Get -> {
                    respond(
                        content = """[
                            {"id":"SQL","name":"SQL [no model]","provider":"sql","is_local":true,"processor_type":"SQL","status":"connected"},
                            {"id":"gemma4sql:google/gemma-4-sql-9b","name":"Gemma-4-SQL (MLX)","provider":"gemma4sql","is_local":true,"processor_type":"GEMMA_4_SQL","status":"connected"}
                        ]""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                path.endsWith("/api/v1/ai/execute") && request.method == HttpMethod.Post -> {
                    respond(
                        content = """{"columns":["beds"],"data":[{"beds":14}],"error":null}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
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
                            "candidates": [
                                {
                                    "id": "cand-1",
                                    "message_id": "msg-1",
                                    "model_name": "MedGemma-27B",
                                    "content": "SELECT * FROM nicu_census",
                                    "sql_snippet": "SELECT * FROM nicu_census",
                                    "is_selected": true
                                },
                                {
                                    "id": "cand-2",
                                    "message_id": "msg-1",
                                    "model_name": "GPT-4o",
                                    "content": "No SQL",
                                    "sql_snippet": null,
                                    "is_selected": false
                                }
                            ]
                        }]""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                path.contains("/vote") && request.method == HttpMethod.Post -> {
                    respond(
                        content = """{"id":"cand-1","message_id":"msg-1","model_name":"MedGemma-27B","content":"SELECT * FROM nicu_census","sql_snippet":"SELECT * FROM nicu_census","is_selected":true}""",
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.method == HttpMethod.Delete -> {
                    respond("", HttpStatusCode.NoContent)
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
     * Verifies that [ChatScreen] loads conversations and selects an initial conversation to display its messages,
     * candidates, history dialog, and composer interactions.
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

        // Stage primary SQL snippet to cart & run on DuckDB
        onNodeWithText("Stage to Cart").performSemanticsAction(SemanticsActions.OnClick)
        onAllNodesWithText("Run on DuckDB")[0].performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()

        // Toggle model chip and click Verify Connections
        onNodeWithText("Gemma-4-SQL (MLX) (connected)").performClick()
        onNodeWithText("Verify Connections").performClick()
        waitForIdle()

        // Expand candidate variations, stage candidate SQL, run candidate on DuckDB, vote as best, and collapse
        onNodeWithText("2 Model Variations").performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onAllNodesWithText("Run on DuckDB")[1].performSemanticsAction(SemanticsActions.OnClick)
        onNodeWithText("Stage").performSemanticsAction(SemanticsActions.OnClick)
        onAllNodesWithText("Vote as Best")[0].performSemanticsAction(SemanticsActions.OnClick)
        onNodeWithText("Hide Variations").performSemanticsAction(SemanticsActions.OnClick)

        // Open History dialog, select conversation, reopen, delete, and close
        onNodeWithContentDescription("History").performClick()
        onNodeWithText("Conversations History").assertIsDisplayed()
        onAllNodesWithText("NICU Bed Utilization")[1].performClick()

        onNodeWithContentDescription("History").performClick()
        onNodeWithContentDescription("Delete").performClick()
        onNodeWithText("Close").performClick()

        // New conversation button & composer input/send
        onNodeWithContentDescription("New Conversation").performClick()
        onNodeWithText("Ask a query...").performTextInput("Show ICU beds")
        onNodeWithContentDescription("Send").performClick()
        waitForIdle()
    }

    /**
     * Verifies standalone [ChatBubble] rendering for user messages and assistant messages without callbacks.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testChatBubbleUserAndAssistantWithoutCallbacks() = runComposeUiTest {
        val userMsg = MessageResponse(
            id = "u-msg",
            conversationId = "c-1",
            role = "user",
            content = "How many beds are available?",
            createdAt = kotlin.time.Instant.parse("2026-09-01T00:00:00Z")
        )
        val assistantMsg = MessageResponse(
            id = "a-msg",
            conversationId = "c-1",
            role = "assistant",
            content = "There are 14 beds.",
            sqlSnippet = "SELECT 14",
            createdAt = kotlin.time.Instant.parse("2026-09-01T00:00:01Z"),
            candidates = listOf(
                MessageCandidateResponse(
                    id = "c-1",
                    modelName = "Claude",
                    content = "SELECT 14",
                    sqlSnippet = "SELECT 14",
                    isSelected = false
                )
            )
        )

        val directSqlMsg = MessageResponse(
            id = "sql-msg",
            conversationId = "c-1",
            role = "assistant",
            content = "Executed directly on read-only DuckDB.\n| col1 | col2 |\n| --- | --- |\n| 1 | 2 |",
            sqlSnippet = "SELECT 1, 2",
            createdAt = kotlin.time.Instant.parse("2026-09-01T00:00:02Z"),
            candidates = listOf(
                MessageCandidateResponse(
                    id = "c-sql",
                    modelName = "SQL [no model]",
                    content = "Executed directly",
                    sqlSnippet = "SELECT 1, 2",
                    isSelected = true
                )
            )
        )
        val multiWithDirectSqlMsg = MessageResponse(
            id = "multi-sql-msg",
            conversationId = "c-1",
            role = "assistant",
            content = "Multiple options generated.",
            createdAt = kotlin.time.Instant.parse("2026-09-01T00:00:03Z"),
            candidates = listOf(
                MessageCandidateResponse(
                    id = "c-sql-2",
                    modelName = "SQL [no model]",
                    content = "Direct SQL result",
                    sqlSnippet = "SELECT 99",
                    isSelected = false
                ),
                MessageCandidateResponse(
                    id = "c-llm-2",
                    modelName = "GPT-4o",
                    content = "LLM result",
                    sqlSnippet = "SELECT 100",
                    isSelected = false
                )
            )
        )

        setContent {
            MaterialTheme {
                androidx.compose.foundation.layout.Column {
                    ChatBubble(message = userMsg, onVoteCandidate = null, onStageToCart = null, onExecuteSql = null)
                    ChatBubble(
                        message = assistantMsg,
                        sqlExecutionResults = mapOf(
                            "a-msg" to io.healthplatform.pulsequery.api.models.SQLExecutionResponse(
                                data = emptyList(),
                                columns = emptyList(),
                                error = "Binder Error"
                            )
                        ),
                        onVoteCandidate = null,
                        onStageToCart = null,
                        onExecuteSql = null
                    )
                    ChatBubble(message = directSqlMsg, onVoteCandidate = null, onStageToCart = null, onExecuteSql = null)
                    ChatBubble(message = multiWithDirectSqlMsg, onVoteCandidate = null, onStageToCart = null, onExecuteSql = null)
                    ChatStreamingPreviewSection(streamingText = "SELECT * FROM live_stream")
                }
            }
        }

        onNodeWithText("How many beds are available?").assertExists()
        onNodeWithText("There are 14 beds.").assertExists()
        onNodeWithText("DuckDB Error: Binder Error").assertExists()
        onNodeWithText("SELECT * FROM live_stream").assertExists()
        onNodeWithText("1 Model Variations").performSemanticsAction(SemanticsActions.OnClick)
        onNodeWithText("2 Model Variations").performSemanticsAction(SemanticsActions.OnClick)
        waitForIdle()
        onNodeWithText("Claude").assertExists()
        onNodeWithText("SQL [no model]").assertExists()
    }

    /**
     * Verifies pure helper functions in [ChatScreen.kt].
     */
    @Test
    fun testChatScreenPureHelpers() {
        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val provided = ChatViewModel(scope = scope)
        assertSame(provided, resolveChatViewModel(provided, "conv-1", scope))
        val created = resolveChatViewModel(null, null, scope)
        assertTrue(created !== provided)

        val titledConv = ConversationResponse(
            id = "c1",
            userId = "u1",
            title = "Pediatrics Census",
            createdAt = kotlin.time.Instant.parse("2026-09-01T00:00:00Z"),
            updatedAt = kotlin.time.Instant.parse("2026-09-01T00:00:00Z")
        )
        val untitledConv = titledConv.copy(title = null)

        assertEquals("New Chat", resolveChatTopBarTitle(null, "New Chat"))
        assertEquals("New Chat", resolveChatTopBarTitle(untitledConv, "New Chat"))
        assertEquals("Pediatrics Census", resolveChatTopBarTitle(titledConv, "New Chat"))

        assertEquals("Pediatrics Census", resolveConversationRowTitle(titledConv, "Untitled"))
        assertEquals("Untitled", resolveConversationRowTitle(untitledConv, "Untitled"))

        assertTrue(isDirectSqlModelName("SQL"))
        assertTrue(isDirectSqlModelName("SQL [no model]"))
        assertTrue(isDirectSqlModelName("SQL [no model] 1"))
        kotlin.test.assertFalse(isDirectSqlModelName("MedGemma"))

        val msgNoCands = MessageResponse(
            id = "m0",
            conversationId = "c1",
            role = "assistant",
            content = "ok",
            createdAt = kotlin.time.Instant.parse("2026-09-01T00:00:00Z"),
            candidates = null
        )
        kotlin.test.assertFalse(isDirectSqlMessageResponse(msgNoCands))
        val msgSingleSql = msgNoCands.copy(
            candidates = listOf(
                MessageCandidateResponse(
                    id = "c1",
                    modelName = "SQL [no model]",
                    content = "ok",
                    isSelected = true
                )
            )
        )
        assertTrue(isDirectSqlMessageResponse(msgSingleSql))
        val msgSingleLlm = msgNoCands.copy(
            candidates = listOf(
                MessageCandidateResponse(
                    id = "c1",
                    modelName = "Claude",
                    content = "ok",
                    isSelected = true
                )
            )
        )
        kotlin.test.assertFalse(isDirectSqlMessageResponse(msgSingleLlm))
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
