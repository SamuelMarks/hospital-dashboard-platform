package io.healthplatform.pulsequery.ui.screens.chat

import io.healthplatform.pulsequery.api.apis.ChatApi
import io.healthplatform.pulsequery.api.models.ConversationResponse
import io.healthplatform.pulsequery.awaitIdle
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.ChatStreamingRepository
import io.healthplatform.pulsequery.network.QueryCartRepository
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant

/**
 * Comprehensive unit tests for [ChatViewModel] and [ChatUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class ChatViewModelTest {

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

    private val conv1Json = """
        {
            "id": "c-1",
            "user_id": "u-1",
            "title": "ICU Census",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z"
        }
    """.trimIndent()

    private val msg1Json = """
        {
            "id": "m-1",
            "conversation_id": "c-1",
            "role": "assistant",
            "content": "Here is the query",
            "sql_snippet": "SELECT 1",
            "created_at": "2026-01-01T00:00:00Z",
            "candidates": []
        }
    """.trimIndent()

    @Test
    fun testChatUiStateProperties() {
        val state = ChatUiState(
            activeConversation = null,
            conversations = emptyList(),
            messages = emptyList(),
            isLoading = false,
            streamingCandidateText = "chunk",
            inputText = "hi",
            errorMessage = "err"
        )
        assertNull(state.activeConversation)
        assertTrue(state.conversations.isEmpty())
        assertTrue(state.messages.isEmpty())
        assertFalse(state.isLoading)
        assertEquals("chunk", state.streamingCandidateText)
        assertEquals("hi", state.inputText)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testLoadConversationsWithAndWithoutInitialConversationId() = kotlinx.coroutines.runBlocking {
        val engine = createUnconfinedMockEngine { req ->
            when {
                req.url.encodedPath.endsWith("/messages") -> respond(
                    content = "[$msg1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    content = "[$conv1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        AppContainer.setHttpClientForTest(createClient(engine))

        // With matching initialConversationId -> resolves activeConversation and loads messages
        val vmWithInitial = ChatViewModel(initialConversationId = "c-1", scope = this)
        vmWithInitial.loadConversations()
        awaitIdle()
        assertEquals("c-1", vmWithInitial.state.value.activeConversation?.id)
        assertEquals(1, vmWithInitial.state.value.messages.size)

        // Reloading when activeConversation is already set keeps currentActive
        vmWithInitial.loadConversations()
        awaitIdle()
        assertEquals("c-1", vmWithInitial.state.value.activeConversation?.id)

        // With non-matching initialConversationId
        val vmUnmatched = ChatViewModel(initialConversationId = "missing", scope = this)
        vmUnmatched.loadConversations()
        awaitIdle()
        assertNull(vmUnmatched.state.value.activeConversation)

        // Without initialConversationId
        val vmNoInitial = ChatViewModel(scope = this)
        vmNoInitial.loadConversations()
        awaitIdle()
        assertNull(vmNoInitial.state.value.activeConversation)
    }

    @Test
    fun testLoadConversationsAndLoadMessagesFailures() = kotlinx.coroutines.runBlocking {
        var throwMsg: String? = "Network down"
        val engineFail = createUnconfinedMockEngine { throw RuntimeException(throwMsg) }
        val apiFail = ChatApi(baseUrl = "http://localhost", httpClient = createClient(engineFail))
        val vm = ChatViewModel(scope = this, chatApi = apiFail)

        val notifications = mutableListOf<String>()
        val job = launch { vm.notifications.collect { notifications.add(it) } }
        kotlinx.coroutines.yield()

        vm.loadConversations()
        awaitIdle(excludeJob = job)
        assertEquals("Failed to load conversations: Network down", vm.state.value.errorMessage)

        throwMsg = null
        vm.loadConversations()
        awaitIdle(excludeJob = job)
        assertEquals("Failed to load conversations: Unknown error", vm.state.value.errorMessage)

        // loadMessages when activeConversation is null
        vm.loadMessages()
        assertTrue(vm.state.value.messages.isEmpty())

        // selectConversation with non-null triggers loadMessages which fails
        val conv = ConversationResponse(
            id = "c-1",
            userId = "u-1",
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
            title = "ICU"
        )
        throwMsg = "Messages timeout"
        vm.selectConversation(conv)
        awaitIdle(excludeJob = job)
        assertEquals("Failed to load messages: Messages timeout", vm.state.value.errorMessage)

        throwMsg = null
        vm.loadMessages()
        awaitIdle(excludeJob = job)
        assertEquals("Failed to load messages: Unknown error", vm.state.value.errorMessage)

        // selectConversation(null) clears activeConversation and messages
        vm.selectConversation(null)
        assertNull(vm.state.value.activeConversation)
        assertTrue(vm.state.value.messages.isEmpty())

        job.cancel()
    }

    @Test
    fun testDeleteConversationActiveInactiveAndFailure() = kotlinx.coroutines.runBlocking {
        val engine = createUnconfinedMockEngine { req ->
            if (req.method == HttpMethod.Delete) {
                respond(content = "", status = HttpStatusCode.NoContent)
            } else {
                respond(
                    content = "[$conv1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val api = ChatApi(baseUrl = "http://localhost", httpClient = createClient(engine))
        val vm = ChatViewModel(scope = this, chatApi = api)
        // Delete when activeConversation is null
        vm.deleteConversation("c-other")
        awaitIdle()

        val conv = ConversationResponse(
            id = "c-1",
            userId = "u-1",
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
            title = "ICU"
        )
        vm.selectConversation(conv)
        awaitIdle()

        // Delete non-active conversation
        vm.deleteConversation("c-other")
        awaitIdle()
        assertEquals("c-1", vm.state.value.activeConversation?.id)

        // Delete active conversation resets activeConversation
        vm.deleteConversation("c-1")
        awaitIdle()
        assertNull(vm.state.value.activeConversation)

        // Delete failure with message and null message
        var errMsg: String? = "Delete forbidden"
        val failApi = ChatApi(
            baseUrl = "http://localhost",
            httpClient = createClient(createUnconfinedMockEngine { throw RuntimeException(errMsg) })
        )
        val vmFail = ChatViewModel(scope = this, chatApi = failApi)
        vmFail.deleteConversation("c-1")
        awaitIdle()
        assertEquals("Failed to delete conversation: Delete forbidden", vmFail.state.value.errorMessage)

        errMsg = null
        vmFail.deleteConversation("c-1")
        awaitIdle()
        assertEquals("Failed to delete conversation: Unknown error", vmFail.state.value.errorMessage)
    }

    @Test
    fun testSendMessageNewAndExistingConversationWithStreamingAndErrors() = kotlinx.coroutines.runBlocking {
        var createMessagesNull = false
        val ssePayload = """
            data: {"event":"start","conversation_id":"c-1"}
            data: {"event":"token","token":"SELECT "}
            data: {"event":"token","token":"1;"}
            data: {"event":"error","error":"minor warn"}
            data: {"event":"done","message_id":"m-1","content":"SELECT 1;","sql_snippet":"SELECT 1;"}
        """.trimIndent()

        val engine = createUnconfinedMockEngine { req ->
            when {
                req.url.encodedPath.contains("/chat/stream/") -> respond(
                    content = ssePayload,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Text.EventStream.toString())
                )
                req.method == HttpMethod.Post && req.url.encodedPath.trimEnd('/').endsWith("/conversations") -> {
                    val body = if (createMessagesNull) {
                        """{"id":"c-1","user_id":"u-1","title":"New","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z"}"""
                    } else {
                        """{"id":"c-1","user_id":"u-1","title":"New","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","messages":[$msg1Json]}"""
                    }
                    respond(
                        content = body,
                        status = HttpStatusCode.Created,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                req.method == HttpMethod.Post && req.url.encodedPath.endsWith("/messages") -> respond(
                    content = msg1Json,
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                req.url.encodedPath.endsWith("/messages") -> respond(
                    content = "[$msg1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    content = "[$conv1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val client = createClient(engine)
        AppContainer.setHttpClientForTest(client)
        AppContainer.currentToken = "jwt-token"

        val vm = ChatViewModel(
            scope = this,
            chatApi = ChatApi(baseUrl = "http://localhost", httpClient = client),
            streamingRepository = null
        )

        // Blank input does nothing
        vm.updateInputText("   ")
        vm.sendMessage()
        awaitIdle()
        assertNull(vm.state.value.activeConversation)

        // First message creates conversation (with non-null messages) and streams tokens
        vm.updateInputText("Show ICU occupancy over the past 30 days")
        vm.sendMessage()
        awaitIdle()
        vm.state.first { !it.isLoading }
        assertNull(vm.state.value.errorMessage, "Unexpected error: ${vm.state.value.errorMessage}")
        assertEquals("c-1", vm.state.value.activeConversation?.id)
        assertEquals(1, vm.state.value.messages.size)
        assertNull(vm.state.value.streamingCandidateText)

        // Second message uses existing activeConversation and blank token skips streaming
        AppContainer.currentToken = ""
        vm.updateInputText("Follow up question")
        vm.sendMessage()
        awaitIdle()
        vm.state.first { !it.isLoading }
        assertEquals("c-1", vm.state.value.activeConversation?.id)

        // Also test when createConversation returns null messages and tokenProvider returns null
        vm.selectConversation(null)
        createMessagesNull = true
        AppContainer.currentToken = null
        vm.updateInputText("Another new chat")
        vm.sendMessage()
        awaitIdle()
        vm.state.first { !it.isLoading }
        assertEquals("c-1", vm.state.value.activeConversation?.id)

        // Also test when streamingRepository.streamTokens throws an exception inside collect
        val throwingStreamRepo = ChatStreamingRepository(
            httpClient = client,
            baseUrlProvider = { throw IllegalStateException("Stream crash") }
        )
        val vmStreamCrash = ChatViewModel(
            scope = this,
            chatApi = ChatApi(baseUrl = "http://localhost", httpClient = client),
            streamingRepository = throwingStreamRepo,
            tokenProvider = { "jwt" }
        )
        vmStreamCrash.updateInputText("Test stream crash")
        vmStreamCrash.sendMessage()
        awaitIdle()
        vmStreamCrash.state.first { !it.isLoading }
        assertNull(vmStreamCrash.state.value.streamingCandidateText)

        // Send failure with message and null message
        var errMsg: String? = "LLM down"
        val failApi = ChatApi(
            baseUrl = "http://localhost",
            httpClient = createClient(createUnconfinedMockEngine { throw RuntimeException(errMsg) })
        )
        val vmFail = ChatViewModel(scope = this, chatApi = failApi)
        vmFail.updateInputText("Hello")
        vmFail.sendMessage()
        awaitIdle()
        vmFail.state.first { !it.isLoading }
        assertEquals("Failed to send message: LLM down", vmFail.state.value.errorMessage)

        errMsg = null
        vmFail.updateInputText("Hello")
        vmFail.sendMessage()
        awaitIdle()
        vmFail.state.first { !it.isLoading }
        assertEquals("Failed to send message: Unknown error", vmFail.state.value.errorMessage)
    }

    @Test
    fun testVoteCandidateAndStageToCart() = kotlinx.coroutines.runBlocking {
        val engine = createUnconfinedMockEngine {
            respond(
                content = msg1Json,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val cart = QueryCartRepository()
        val vm = ChatViewModel(
            scope = this,
            chatApi = ChatApi(baseUrl = "http://localhost", httpClient = createClient(engine)),
            queryCartRepository = cart
        )

        // Vote when activeConversation is null -> early return
        vm.voteCandidate("m-1", "cand-1")
        vm.selectConversation(null)
        vm.voteCandidate("m-1", "cand-1")
        awaitIdle()

        // Select conversation and vote successfully
        val conv = ConversationResponse(
            id = "c-1",
            userId = "u-1",
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
            title = "ICU"
        )
        val engineListAndVote = createUnconfinedMockEngine { req ->
            when {
                req.method == HttpMethod.Post -> respond(
                    content = msg1Json,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                req.url.encodedPath.endsWith("/conversations") -> respond(
                    content = "[$conv1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    content = "[$msg1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val vmVote = ChatViewModel(
            scope = this,
            chatApi = ChatApi(baseUrl = "http://localhost", httpClient = createClient(engineListAndVote)),
            queryCartRepository = cart
        )
        vmVote.selectConversation(conv)
        awaitIdle()
        assertEquals(
            1,
            vmVote.messagesByRole(io.healthplatform.pulsequery.core.model.MessageAuthorRole.ASSISTANT).size
        )
        assertEquals(
            0,
            vmVote.messagesByRole(io.healthplatform.pulsequery.core.model.MessageAuthorRole.USER).size
        )
        vmVote.voteCandidate(
            io.healthplatform.pulsequery.core.model.MessageId("m-1"),
            io.healthplatform.pulsequery.core.model.CandidateId("cand-1")
        )
        awaitIdle()
        assertNull(vmVote.state.value.errorMessage)
        vmVote.deleteConversation(io.healthplatform.pulsequery.core.model.ConversationId("c-1"))
        awaitIdle()

        // Vote failure with message and null message
        var errMsg: String? = "Vote failed"
        val vmVoteFail = ChatViewModel(
            scope = this,
            chatApi = ChatApi(baseUrl = "http://localhost", httpClient = createClient(createUnconfinedMockEngine { throw RuntimeException(errMsg) }))
        )
        vmVoteFail.selectConversation(conv)
        awaitIdle()
        vmVoteFail.voteCandidate("m-1", "cand-1")
        awaitIdle()
        assertEquals("Vote failed", vmVoteFail.state.value.errorMessage)

        errMsg = null
        vmVoteFail.voteCandidate("m-1", "cand-1")
        awaitIdle()
        assertEquals("Failed to record vote", vmVoteFail.state.value.errorMessage)

        // Stage to cart
        vm.stageToCart("ICU Query", "SELECT * FROM icu")
        assertEquals(1, cart.stagedQueries.value.size)
    }

    @Test
    fun testLoadAvailableModelsToggleModelAndExecuteSqlSnippet() = kotlinx.coroutines.runBlocking {
        val modelsJson = """
            [
                {"id":"SQL","name":"SQL [no model]","provider":"sql","is_local":true,"processor_type":"SQL","status":"connected"},
                {"id":"gemma4sql:google/gemma-4-sql-9b","name":"Gemma-4-SQL (MLX)","provider":"gemma4sql","is_local":true,"processor_type":"GEMMA_4_SQL","status":"connected"}
            ]
        """.trimIndent()
        val execRespJson = """{"columns":["cnt"],"data":[{"cnt":10}],"error":null}"""

        val engine = createUnconfinedMockEngine { req ->
            when {
                req.url.encodedPath.endsWith("/api/v1/ai/models") -> respond(
                    content = modelsJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                req.url.encodedPath.endsWith("/api/v1/ai/execute") -> respond(
                    content = execRespJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                req.method == HttpMethod.Post && req.url.encodedPath.trimEnd('/').endsWith("/conversations") -> respond(
                    content = """{"id":"c-1","user_id":"u-1","title":"New","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","messages":[$msg1Json]}""",
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    content = "[$conv1Json]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val client = createClient(engine)
        AppContainer.setHttpClientForTest(client)

        val vm = ChatViewModel(
            scope = this,
            chatApi = ChatApi(baseUrl = "http://localhost", httpClient = client),
            aiApi = null
        )
        vm.loadAvailableModels()
        awaitIdle()
        assertEquals(2, vm.state.value.availableModels.size)
        assertEquals("GEMMA_4_SQL", vm.state.value.availableModels[1].processorType)

        // Toggle model selection on and off
        vm.toggleModelSelection("SQL")
        assertTrue(vm.state.value.selectedModelIds.contains("SQL"))
        vm.updateInputText("SELECT 10 AS cnt")
        vm.sendMessage()
        awaitIdle()
        vm.toggleModelSelection("SQL")
        assertFalse(vm.state.value.selectedModelIds.contains("SQL"))

        // Execute SQL snippet: blank vs non-blank success
        vm.executeSqlSnippet("m-1", "   ")
        awaitIdle()
        assertTrue(vm.state.value.sqlExecutionResults.isEmpty())

        vm.executeSqlSnippet("m-1", "SELECT 10 AS cnt")
        awaitIdle()
        assertEquals(1, vm.state.value.sqlExecutionResults["m-1"]?.data?.size)

        // Failure branches for loadAvailableModels and executeSqlSnippet with explicit AiApi
        val failAiApi = io.healthplatform.pulsequery.api.apis.AiApi(
            baseUrl = "http://localhost",
            httpClient = createClient(createUnconfinedMockEngine { throw RuntimeException("DuckDB error") })
        )
        val vmFail = ChatViewModel(scope = this, aiApi = failAiApi)
        vmFail.loadAvailableModels()
        awaitIdle()
        assertEquals("SQL", vmFail.state.value.availableModels.first().id)
        vmFail.executeSqlSnippet("m-err", "SELECT 1")
        awaitIdle()
        assertEquals("DuckDB error", vmFail.state.value.sqlExecutionResults["m-err"]?.error)

        // When backend returns models without SQL, DEFAULT_SQL_MODEL_INFO is prepended
        val noSqlAiApi = io.healthplatform.pulsequery.api.apis.AiApi(
            baseUrl = "http://localhost",
            httpClient = createClient(createUnconfinedMockEngine {
                respond(
                    content = """[{"id":"ollama:hf.co/google/gemma-4-E4B","name":"Gemma 4 E4B","provider":"ollama","is_local":true,"processor_type":"OLLAMA"}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            })
        )
        val vmNoSql = ChatViewModel(scope = this, aiApi = noSqlAiApi)
        vmNoSql.loadAvailableModels()
        awaitIdle()
        assertEquals(2, vmNoSql.state.value.availableModels.size)
        assertEquals("SQL", vmNoSql.state.value.availableModels[0].id)
    }
}
