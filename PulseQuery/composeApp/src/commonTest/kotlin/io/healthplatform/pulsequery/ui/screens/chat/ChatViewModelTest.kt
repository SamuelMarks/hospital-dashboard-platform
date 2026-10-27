package io.healthplatform.pulsequery.ui.screens.chat

import io.healthplatform.pulsequery.api.apis.ChatApi
import io.healthplatform.pulsequery.api.models.ConversationResponse
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
        val engine = MockEngine { req ->
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
        kotlinx.coroutines.delay(50)
        assertEquals("c-1", vmWithInitial.state.value.activeConversation?.id)
        assertEquals(1, vmWithInitial.state.value.messages.size)

        // Reloading when activeConversation is already set keeps currentActive
        vmWithInitial.loadConversations()
        kotlinx.coroutines.delay(50)
        assertEquals("c-1", vmWithInitial.state.value.activeConversation?.id)

        // With non-matching initialConversationId
        val vmUnmatched = ChatViewModel(initialConversationId = "missing", scope = this)
        vmUnmatched.loadConversations()
        kotlinx.coroutines.delay(50)
        assertNull(vmUnmatched.state.value.activeConversation)

        // Without initialConversationId
        val vmNoInitial = ChatViewModel(scope = this)
        vmNoInitial.loadConversations()
        kotlinx.coroutines.delay(50)
        assertNull(vmNoInitial.state.value.activeConversation)
    }

    @Test
    fun testLoadConversationsAndLoadMessagesFailures() = kotlinx.coroutines.runBlocking {
        var throwMsg: String? = "Network down"
        val engineFail = MockEngine { throw RuntimeException(throwMsg) }
        val apiFail = ChatApi(baseUrl = "http://localhost", httpClient = createClient(engineFail))
        val vm = ChatViewModel(scope = this, chatApi = apiFail)

        val notifications = mutableListOf<String>()
        val job = launch { vm.notifications.collect { notifications.add(it) } }

        vm.loadConversations()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load conversations: Network down", vm.state.value.errorMessage)

        throwMsg = null
        vm.loadConversations()
        kotlinx.coroutines.delay(50)
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
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load messages: Messages timeout", vm.state.value.errorMessage)

        throwMsg = null
        vm.loadMessages()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load messages: Unknown error", vm.state.value.errorMessage)

        // selectConversation(null) clears activeConversation and messages
        vm.selectConversation(null)
        assertNull(vm.state.value.activeConversation)
        assertTrue(vm.state.value.messages.isEmpty())

        job.cancel()
    }

    @Test
    fun testDeleteConversationActiveInactiveAndFailure() = kotlinx.coroutines.runBlocking {
        val engine = MockEngine { req ->
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
        kotlinx.coroutines.delay(50)

        val conv = ConversationResponse(
            id = "c-1",
            userId = "u-1",
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
            title = "ICU"
        )
        vm.selectConversation(conv)
        kotlinx.coroutines.delay(50)

        // Delete non-active conversation
        vm.deleteConversation("c-other")
        kotlinx.coroutines.delay(50)
        assertEquals("c-1", vm.state.value.activeConversation?.id)

        // Delete active conversation resets activeConversation
        vm.deleteConversation("c-1")
        kotlinx.coroutines.delay(50)
        assertNull(vm.state.value.activeConversation)

        // Delete failure with message and null message
        var errMsg: String? = "Delete forbidden"
        val failApi = ChatApi(
            baseUrl = "http://localhost",
            httpClient = createClient(MockEngine { throw RuntimeException(errMsg) })
        )
        val vmFail = ChatViewModel(scope = this, chatApi = failApi)
        vmFail.deleteConversation("c-1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to delete conversation: Delete forbidden", vmFail.state.value.errorMessage)

        errMsg = null
        vmFail.deleteConversation("c-1")
        kotlinx.coroutines.delay(50)
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

        val engine = MockEngine { req ->
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
        kotlinx.coroutines.delay(50)
        assertNull(vm.state.value.activeConversation)

        // First message creates conversation (with non-null messages) and streams tokens
        vm.updateInputText("Show ICU occupancy over the past 30 days")
        vm.sendMessage()
        vm.state.first { !it.isLoading }
        assertNull(vm.state.value.errorMessage, "Unexpected error: ${vm.state.value.errorMessage}")
        assertEquals("c-1", vm.state.value.activeConversation?.id)
        assertEquals(1, vm.state.value.messages.size)
        assertNull(vm.state.value.streamingCandidateText)

        // Second message uses existing activeConversation and blank token skips streaming
        AppContainer.currentToken = ""
        vm.updateInputText("Follow up question")
        vm.sendMessage()
        vm.state.first { !it.isLoading }
        assertEquals("c-1", vm.state.value.activeConversation?.id)

        // Also test when createConversation returns null messages and tokenProvider returns null
        vm.selectConversation(null)
        createMessagesNull = true
        AppContainer.currentToken = null
        vm.updateInputText("Another new chat")
        vm.sendMessage()
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
        vmStreamCrash.state.first { !it.isLoading }
        assertNull(vmStreamCrash.state.value.streamingCandidateText)

        // Send failure with message and null message
        var errMsg: String? = "LLM down"
        val failApi = ChatApi(
            baseUrl = "http://localhost",
            httpClient = createClient(MockEngine { throw RuntimeException(errMsg) })
        )
        val vmFail = ChatViewModel(scope = this, chatApi = failApi)
        vmFail.updateInputText("Hello")
        vmFail.sendMessage()
        vmFail.state.first { !it.isLoading }
        assertEquals("Failed to send message: LLM down", vmFail.state.value.errorMessage)

        errMsg = null
        vmFail.updateInputText("Hello")
        vmFail.sendMessage()
        vmFail.state.first { !it.isLoading }
        assertEquals("Failed to send message: Unknown error", vmFail.state.value.errorMessage)
    }

    @Test
    fun testVoteCandidateAndStageToCart() = kotlinx.coroutines.runBlocking {
        val engine = MockEngine {
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
        kotlinx.coroutines.delay(50)

        // Select conversation and vote successfully
        val conv = ConversationResponse(
            id = "c-1",
            userId = "u-1",
            createdAt = Instant.parse("2026-01-01T00:00:00Z"),
            updatedAt = Instant.parse("2026-01-01T00:00:00Z"),
            title = "ICU"
        )
        val engineListAndVote = MockEngine { req ->
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
        kotlinx.coroutines.delay(50)
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
        kotlinx.coroutines.delay(50)
        assertNull(vmVote.state.value.errorMessage)
        vmVote.deleteConversation(io.healthplatform.pulsequery.core.model.ConversationId("c-1"))
        kotlinx.coroutines.delay(50)

        // Vote failure with message and null message
        var errMsg: String? = "Vote failed"
        val vmVoteFail = ChatViewModel(
            scope = this,
            chatApi = ChatApi(baseUrl = "http://localhost", httpClient = createClient(MockEngine { throw RuntimeException(errMsg) }))
        )
        vmVoteFail.selectConversation(conv)
        kotlinx.coroutines.delay(50)
        vmVoteFail.voteCandidate("m-1", "cand-1")
        kotlinx.coroutines.delay(50)
        assertEquals("Vote failed", vmVoteFail.state.value.errorMessage)

        errMsg = null
        vmVoteFail.voteCandidate("m-1", "cand-1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to record vote", vmVoteFail.state.value.errorMessage)

        // Stage to cart
        vm.stageToCart("ICU Query", "SELECT * FROM icu")
        assertEquals(1, cart.stagedQueries.value.size)
    }
}
