/**
 * Chat ViewModel module orchestrating conversation history, message sending,
 * real-time SSE token streaming via [ChatStreamingRepository], candidate voting, and query cart staging.
 */
package io.healthplatform.pulsequery.ui.screens.chat

import io.healthplatform.pulsequery.api.apis.ChatApi
import io.healthplatform.pulsequery.api.models.ConversationCreate
import io.healthplatform.pulsequery.api.models.ConversationDetail
import io.healthplatform.pulsequery.api.models.ConversationResponse
import io.healthplatform.pulsequery.api.models.MessageCreate
import io.healthplatform.pulsequery.api.models.MessageResponse
import io.healthplatform.pulsequery.api.models.MessageVoteRequest
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.model.CandidateId
import io.healthplatform.pulsequery.core.model.ConversationId
import io.healthplatform.pulsequery.core.model.MessageAuthorRole
import io.healthplatform.pulsequery.core.model.MessageId
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.asResultMap
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.core.result.runResultPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.ChatStreamEvent
import io.healthplatform.pulsequery.network.ChatStreamingRepository
import io.healthplatform.pulsequery.network.QueryCartRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.ChatScreen].
 *
 * @property activeConversation Currently selected conversation, or null for a new chat.
 * @property conversations List of all conversations in user history.
 * @property messages Ordered list of messages in the active conversation.
 * @property isLoading Whether a conversation or message operation is in flight.
 * @property streamingCandidateText Live SSE token stream buffer while an assistant response is streaming.
 * @property inputText Current user input text in the chat composer.
 * @property errorMessage User-visible error message if an operation fails.
 */
data class ChatUiState(
    val activeConversation: ConversationResponse? = null,
    val conversations: List<ConversationResponse> = emptyList(),
    val messages: List<MessageResponse> = emptyList(),
    val isLoading: Boolean = false,
    val streamingCandidateText: String? = null,
    val inputText: String = "",
    val errorMessage: String? = null
)

/**
 * ViewModel managing state and operations for the Chat Arena screen.
 *
 * @property initialConversationId Optional initial conversation UUID to select upon loading.
 * @property scope Coroutine scope used for asynchronous API and SSE streaming calls.
 * @property chatApi Optional explicit [ChatApi] client for conversation and message endpoints.
 * @property streamingRepository Optional explicit [ChatStreamingRepository] for live SSE token streaming.
 * @property queryCartRepository Repository for staging SQL snippets to the query cart.
 * @property tokenProvider Provider returning the active JWT token for SSE streaming.
 */
class ChatViewModel(
    private val initialConversationId: String? = null,
    private val scope: CoroutineScope,
    private val chatApi: ChatApi? = null,
    private val streamingRepository: ChatStreamingRepository? = null,
    private val queryCartRepository: QueryCartRepository = AppContainer.queryCartRepository,
    private val tokenProvider: () -> String? = { AppContainer.currentToken }
) {
    private val currentChatApi: ChatApi
        get() = chatApi ?: AppContainer.chatApi

    private val currentStreamingRepository: ChatStreamingRepository
        get() = streamingRepository ?: AppContainer.chatStreamingRepository

    private val _state = MutableStateFlow(ChatUiState())

    /** Reactive [StateFlow] of the current [ChatUiState]. */
    val state: StateFlow<ChatUiState> = _state.asStateFlow()

    private val _notifications = MutableSharedFlow<String>(extraBufferCapacity = 8)

    /** Stream of user-facing snackbar notification messages. */
    val notifications: SharedFlow<String> = _notifications.asSharedFlow()

    /**
     * Loads the user's conversation history from the backend.
     */
    fun loadConversations() {
        scope.launch {
            runResultPulseAsync {
                currentChatApi.listConversationsApiV1ConversationsGet().asResult()
            }.fold(
                onSuccess = { list ->
                    val currentActive = _state.value.activeConversation
                    val resolvedActive = if (currentActive == null && initialConversationId != null) {
                        list.find { it.id == initialConversationId }
                    } else {
                        currentActive
                    }
                    _state.update {
                        it.copy(
                            conversations = list,
                            activeConversation = resolvedActive,
                            errorMessage = null
                        )
                    }
                    if (resolvedActive != null && currentActive == null) {
                        loadMessages()
                    }
                },
                onFailure = { e ->
                    val msg = "Failed to load conversations: ${e.messageOrDefault(UiErrorKey.UNKNOWN_ERROR)}"
                    _state.update { it.copy(errorMessage = msg) }
                    _notifications.tryEmit(msg)
                }
            )
        }
    }

    /**
     * Selects an existing conversation and loads its message history.
     *
     * @param conversation The [ConversationResponse] to activate, or null to start a new chat.
     */
    fun selectConversation(conversation: ConversationResponse?) {
        _state.update {
            it.copy(
                activeConversation = conversation,
                messages = if (conversation == null) emptyList() else it.messages,
                errorMessage = null
            )
        }
        if (conversation != null) {
            loadMessages()
        }
    }

    /**
     * Loads all messages for the currently active conversation.
     */
    fun loadMessages() {
        val active = _state.value.activeConversation ?: run {
            _state.update { it.copy(messages = emptyList()) }
            return
        }
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runResultPulseAsync {
                currentChatApi.getMessagesApiV1ConversationsConversationIdMessagesGet(
                    conversationId = active.id
                ).asResult()
            }.fold(
                onSuccess = { msgs ->
                    _state.update { it.copy(messages = msgs, errorMessage = null) }
                },
                onFailure = { e ->
                    val msg = "Failed to load messages: ${e.messageOrDefault(UiErrorKey.UNKNOWN_ERROR)}"
                    _state.update { it.copy(errorMessage = msg) }
                    _notifications.tryEmit(msg)
                }
            )
            _state.update { it.copy(isLoading = false) }
        }
    }

    /**
     * Updates the composer input text.
     *
     * @param text New input text.
     */
    fun updateInputText(text: String) {
        _state.update { it.copy(inputText = text) }
    }

    /**
     * Deletes a conversation by [id] and refreshes the conversation list.
     *
     * @param id UUID of the conversation to delete.
     */
    fun deleteConversation(id: String) {
        scope.launch {
            runResultPulseAsync {
                currentChatApi.deleteConversationApiV1ConversationsConversationIdDelete(id).asResult()
            }.fold(
                onSuccess = {
                    if (_state.value.activeConversation?.id == id) {
                        _state.update { it.copy(activeConversation = null, messages = emptyList()) }
                    }
                    loadConversations()
                },
                onFailure = { e ->
                    val msg = "Failed to delete conversation: ${e.messageOrDefault(UiErrorKey.UNKNOWN_ERROR)}"
                    _state.update { it.copy(errorMessage = msg) }
                    _notifications.tryEmit(msg)
                }
            )
        }
    }

    /**
     * Sends the current [ChatUiState.inputText] message, streaming live assistant tokens via
     * [ChatStreamingRepository] and falling back gracefully to standard REST message retrieval.
     */
    fun sendMessage() {
        val rawInput = _state.value.inputText
        if (rawInput.isBlank()) return
        val textToSend = rawInput.trim()
        _state.update { it.copy(inputText = "", isLoading = true, errorMessage = null) }

        scope.launch {
            val active = _state.value.activeConversation
            val convResult: Result<ConversationResponse> = runResultPulseAsync {
                if (active == null) {
                    currentChatApi.createConversationApiV1ConversationsPost(
                        ConversationCreate(
                            title = textToSend.take(20),
                            message = textToSend
                        )
                    ).asResultMap { detail: ConversationDetail ->
                        val created = ConversationResponse(
                            id = detail.id,
                            userId = detail.userId,
                            createdAt = detail.createdAt,
                            updatedAt = detail.updatedAt,
                            title = detail.title
                        )
                        _state.update {
                            it.copy(
                                activeConversation = created,
                                messages = detail.messages.orEmpty()
                            )
                        }
                        loadConversations()
                        created
                    }
                } else {
                    currentChatApi.sendMessageApiV1ConversationsConversationIdMessagesPost(
                        conversationId = active.id,
                        messageCreate = MessageCreate(content = textToSend)
                    ).asResultMap { active }
                }
            }
            convResult.fold(
                onSuccess = { targetConv ->
                    streamTokensForConversation(targetConv.id)
                    loadMessages()
                },
                onFailure = { e ->
                    val msg = "Failed to send message: ${e.messageOrDefault(UiErrorKey.UNKNOWN_ERROR)}"
                    _state.update { it.copy(errorMessage = msg, streamingCandidateText = null) }
                    _notifications.tryEmit(msg)
                }
            )
            _state.update { it.copy(isLoading = false, streamingCandidateText = null) }
        }
    }

    private suspend fun streamTokensForConversation(conversationId: String) {
        val token = tokenProvider()
        if (token.isNullOrBlank()) return
        val buffer = StringBuilder()
        runCatchingPulseAsync {
            currentStreamingRepository.streamTokens(
                conversationId = conversationId,
                token = token
            ).collect { event ->
                when (event) {
                    is ChatStreamEvent.StreamStarted -> Unit
                    is ChatStreamEvent.TokenChunk -> {
                        buffer.append(event.token)
                        _state.update { it.copy(streamingCandidateText = buffer.toString()) }
                    }
                    is ChatStreamEvent.StreamDone -> {
                        _state.update { it.copy(streamingCandidateText = null) }
                    }
                    is ChatStreamEvent.StreamError -> {
                        _state.update { it.copy(streamingCandidateText = null) }
                    }
                }
            }
        }.onFailure {
            _state.update { it.copy(streamingCandidateText = null) }
        }
    }

    /**
     * Records a user vote for a specific model candidate on a message.
     *
     * @param messageId UUID of the parent assistant message.
     * @param candidateId UUID of the selected candidate variation.
     */
    fun voteCandidate(messageId: String, candidateId: String) {
        val active = _state.value.activeConversation ?: return
        scope.launch {
            runResultPulseAsync {
                currentChatApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost(
                    conversationId = active.id,
                    messageId = messageId,
                    messageVoteRequest = MessageVoteRequest(candidateId = candidateId)
                ).asResult()
            }.fold(
                onSuccess = {
                    _notifications.tryEmit("Vote recorded successfully")
                    loadMessages()
                },
                onFailure = { e ->
                    val msg = e.messageOrDefault(UiErrorKey.RECORD_VOTE)
                    _state.update { it.copy(errorMessage = msg) }
                    _notifications.tryEmit(msg)
                }
            )
        }
    }

    /**
     * Stages a generated SQL candidate to the global [QueryCartRepository].
     *
     * @param title Descriptive title for the staged query.
     * @param sql Raw SQL query string.
     */
    fun stageToCart(title: String, sql: String) {
        queryCartRepository.addQuery(title, sql)
        _notifications.tryEmit("Query staged to cart")
    }

    /**
     * Deletes a conversation by strongly typed [ConversationId] and refreshes the conversation list.
     *
     * @param conversationId Target [ConversationId].
     */
    fun deleteConversation(conversationId: ConversationId) {
        deleteConversation(conversationId.value)
    }

    /**
     * Submits a vote for a specific LLM candidate using strongly typed [MessageId] and [CandidateId].
     *
     * @param messageId Parent [MessageId].
     * @param candidateId Selected [CandidateId].
     */
    fun voteCandidate(messageId: MessageId, candidateId: CandidateId) {
        voteCandidate(messageId.value, candidateId.value)
    }

    /**
     * Filters the current conversation's messages by strongly typed [MessageAuthorRole].
     *
     * @param role Target [MessageAuthorRole] (`USER`, `ASSISTANT`, or `SYSTEM`).
     * @return List of messages authored by [role].
     */
    fun messagesByRole(role: MessageAuthorRole): List<MessageResponse> =
        _state.value.messages.filter { MessageAuthorRole.fromWire(it.role) == role }
}
