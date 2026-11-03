/**
 * Component for rendering the ChatScreen.
 * Provides the main user interface for conversational SQL generation, model selection (`any-llm`,
 * Ollama, `gemma-4-sql`, Gemini, Direct SQL), inline read-only DuckDB execution, and model arena evaluation,
 * delegating all state and SSE streaming to [ChatViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.ConversationResponse
import io.healthplatform.pulsequery.api.models.MessageCandidateResponse
import io.healthplatform.pulsequery.api.models.MessageResponse
import io.healthplatform.pulsequery.api.models.ModelInfo
import io.healthplatform.pulsequery.api.models.SQLExecutionResponse
import io.healthplatform.pulsequery.ui.screens.chat.ChatUiState
import io.healthplatform.pulsequery.ui.screens.chat.ChatViewModel
import kotlinx.coroutines.CoroutineScope
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.ask_a_query
import pulsequery.composeapp.generated.resources.assistant_streaming
import pulsequery.composeapp.generated.resources.chat_candidate_selected_state
import pulsequery.composeapp.generated.resources.chat_candidate_sql_title
import pulsequery.composeapp.generated.resources.chat_candidate_unselected_state
import pulsequery.composeapp.generated.resources.chat_model_status_fmt
import pulsequery.composeapp.generated.resources.chat_model_variations_count
import pulsequery.composeapp.generated.resources.chat_query_default_title
import pulsequery.composeapp.generated.resources.chat_run_on_duckdb
import pulsequery.composeapp.generated.resources.chat_sql_preview_error_fmt
import pulsequery.composeapp.generated.resources.chat_sql_preview_rows_fmt
import pulsequery.composeapp.generated.resources.chat_verify_connections
import pulsequery.composeapp.generated.resources.close
import pulsequery.composeapp.generated.resources.conversations_history
import pulsequery.composeapp.generated.resources.delete
import pulsequery.composeapp.generated.resources.hide_variations
import pulsequery.composeapp.generated.resources.history
import pulsequery.composeapp.generated.resources.new_chat
import pulsequery.composeapp.generated.resources.new_conversation
import pulsequery.composeapp.generated.resources.send
import pulsequery.composeapp.generated.resources.stage
import pulsequery.composeapp.generated.resources.stage_to_cart
import pulsequery.composeapp.generated.resources.start_a_new_conversation
import pulsequery.composeapp.generated.resources.untitled
import pulsequery.composeapp.generated.resources.vote_as_best
import pulsequery.composeapp.generated.resources.winner_badge

/**
 * Resolves the active [ChatViewModel], returning [viewModel] when provided or creating a scoped instance.
 *
 * @param viewModel Optional caller-supplied [ChatViewModel].
 * @param conversationId Optional initial conversation ID.
 * @param scope CoroutineScope used when constructing a default [ChatViewModel].
 * @return Active [ChatViewModel] instance.
 */
internal fun resolveChatViewModel(
    viewModel: ChatViewModel?,
    conversationId: String?,
    scope: CoroutineScope
): ChatViewModel {
    return viewModel ?: ChatViewModel(initialConversationId = conversationId, scope = scope)
}

/**
 * Resolves the top bar title for [ChatScreen], falling back to [defaultTitle] when no conversation or title is set.
 *
 * @param activeConversation Active [ConversationResponse] or null.
 * @param defaultTitle Localized fallback title.
 * @return Non-null top bar title string.
 */
internal fun resolveChatTopBarTitle(
    activeConversation: ConversationResponse?,
    defaultTitle: String
): String {
    return activeConversation?.title ?: defaultTitle
}

/**
 * Resolves the display title for a conversation history row, falling back to [untitledFallback] when null.
 *
 * @param conversation Target [ConversationResponse].
 * @param untitledFallback Localized untitled fallback string.
 * @return Non-null conversation title string.
 */
internal fun resolveConversationRowTitle(
    conversation: ConversationResponse,
    untitledFallback: String
): String {
    return conversation.title ?: untitledFallback
}

/**
 * Main chat interface for querying the system using natural language or direct SQL.
 *
 * @param conversationId Optional existing conversation ID to load. If null, starts a new conversation.
 * @param viewModel Optional [ChatViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    conversationId: String? = null,
    viewModel: ChatViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, conversationId, coroutineScope) {
        resolveChatViewModel(viewModel, conversationId, coroutineScope)
    }

    val uiState by vm.state.collectAsState()
    var showConversationsDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(vm) {
        vm.performLoadConversations()
        vm.performLoadAvailableModels()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            ChatTopBar(
                activeConversation = uiState.activeConversation,
                onNewConversation = { vm.selectConversation(null) },
                onShowHistory = { showConversationsDialog = true }
            )
        }
    ) { paddingValues ->
        ChatScreenBody(
            uiState = uiState,
            paddingValues = paddingValues,
            onVoteCandidate = { msgId, candidateId -> vm.voteCandidate(msgId, candidateId) },
            onStageToCart = { title, sql -> vm.stageToCart(title, sql) },
            onExecuteSql = { key, sql -> vm.executeSqlSnippet(key, sql) },
            onToggleModel = { modelId -> vm.toggleModelSelection(modelId) },
            onVerifyModels = { vm.loadAvailableModels() },
            onInputTextChange = { vm.updateInputText(it) },
            onSendMessage = { vm.sendMessage() }
        )

        if (showConversationsDialog) {
            ChatConversationsHistoryDialog(
                conversations = uiState.conversations,
                onDismiss = { showConversationsDialog = false },
                onSelectConversation = { conv ->
                    vm.selectConversation(conv)
                    showConversationsDialog = false
                },
                onDeleteConversation = { convId -> vm.deleteConversation(convId) }
            )
        }
    }
}

/**
 * Renders the top app bar for [ChatScreen].
 *
 * @param activeConversation Active [ConversationResponse] or null.
 * @param onNewConversation Callback invoked when the New Conversation button is clicked.
 * @param onShowHistory Callback invoked when the History button is clicked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatTopBar(
    activeConversation: ConversationResponse?,
    onNewConversation: () -> Unit,
    onShowHistory: () -> Unit
) {
    TopAppBar(
        title = {
            Text(resolveChatTopBarTitle(activeConversation, stringResource(Res.string.new_chat)))
        },
        actions = {
            IconButton(onClick = onNewConversation) {
                Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.new_conversation))
            }
            IconButton(onClick = onShowHistory) {
                Icon(Icons.AutoMirrored.Filled.List, contentDescription = stringResource(Res.string.history))
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface
        )
    )
}

/**
 * Renders the main message stream, streaming candidate preview, model selector bar, and composer input for [ChatScreen].
 *
 * @param uiState Current [ChatUiState].
 * @param paddingValues Scaffold inner padding.
 * @param onVoteCandidate Callback invoked with `(messageId, candidateId)` when voting for a candidate.
 * @param onStageToCart Callback invoked with `(title, sql)` when staging SQL to the query cart.
 * @param onExecuteSql Callback invoked with `(key, sql)` when running SQL on read-only DuckDB.
 * @param onToggleModel Callback invoked with `modelId` when toggling a target model chip.
 * @param onVerifyModels Callback invoked when verifying model connections.
 * @param onInputTextChange Callback invoked when the composer text changes.
 * @param onSendMessage Callback invoked when the Send button is clicked.
 */
@Composable
private fun ChatScreenBody(
    uiState: ChatUiState,
    paddingValues: PaddingValues,
    onVoteCandidate: (String, String) -> Unit,
    onStageToCart: (String, String) -> Unit,
    onExecuteSql: (String, String) -> Unit,
    onToggleModel: (String) -> Unit,
    onVerifyModels: () -> Unit,
    onInputTextChange: (String) -> Unit,
    onSendMessage: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(paddingValues)
    ) {
        uiState.errorMessage?.let { err ->
            Text(
                text = err,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier
                    .padding(horizontal = 16.dp, vertical = 4.dp)
                    .semantics { liveRegion = LiveRegionMode.Assertive }
            )
        }

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                ChatEmptyStateSection(
                    showEmptyPlaceholder = uiState.messages.isEmpty() && !uiState.isLoading
                )
            }
            items(uiState.messages) { message ->
                ChatBubble(
                    message = message,
                    sqlExecutionResults = uiState.sqlExecutionResults,
                    onVoteCandidate = { candidateId ->
                        onVoteCandidate(message.id, candidateId)
                    },
                    onStageToCart = onStageToCart,
                    onExecuteSql = onExecuteSql
                )
            }
            item {
                ChatStreamingPreviewSection(streamingText = uiState.streamingCandidateText)
            }
        }

        if (uiState.isLoading) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }

        ChatModelSelectorRow(
            availableModels = uiState.availableModels,
            selectedModelIds = uiState.selectedModelIds,
            onToggleModel = onToggleModel,
            onVerifyModels = onVerifyModels
        )

        ChatComposerRow(
            inputText = uiState.inputText,
            isLoading = uiState.isLoading,
            onInputTextChange = onInputTextChange,
            onSendMessage = onSendMessage
        )
    }
}

/**
 * Renders the horizontal model selector chip bar with connection status badges and a Verify Connections action.
 *
 * @param availableModels List of configured/discovered [ModelInfo] processors.
 * @param selectedModelIds Set of currently selected model identifiers.
 * @param onToggleModel Callback invoked when a model chip is clicked.
 * @param onVerifyModels Callback invoked when the Verify Connections button is clicked.
 */
@Composable
internal fun ChatModelSelectorRow(
    availableModels: List<ModelInfo>,
    selectedModelIds: Set<String>,
    onToggleModel: (String) -> Unit,
    onVerifyModels: () -> Unit
) {
    if (availableModels.isNotEmpty()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            availableModels.forEach { model ->
                val isSelected = selectedModelIds.contains(model.id)
                FilterChip(
                    selected = isSelected,
                    onClick = { onToggleModel(model.id) },
                    label = {
                        Text(
                            stringResource(
                                Res.string.chat_model_status_fmt,
                                model.name,
                                model.status
                            )
                        )
                    }
                )
            }
            TextButton(onClick = onVerifyModels) {
                Text(stringResource(Res.string.chat_verify_connections))
            }
        }
    }
}

/**
 * Renders the empty conversation prompt when no messages are loaded and no request is in progress.
 *
 * @param showEmptyPlaceholder Whether to display the empty conversation placeholder.
 */
@Composable
private fun ChatEmptyStateSection(showEmptyPlaceholder: Boolean) {
    if (showEmptyPlaceholder) {
        Box(modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
            Text(
                stringResource(Res.string.start_a_new_conversation),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Renders the live SSE streaming candidate card while an assistant response is in flight.
 *
 * @param streamingText Current streaming text or null when idle.
 */
@Composable
internal fun ChatStreamingPreviewSection(streamingText: String?) {
    if (streamingText != null) {
        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            ),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
                .semantics { liveRegion = LiveRegionMode.Polite }
        ) {
            ChatStreamingCardContent(streamingText = streamingText)
        }
    }
}

/**
 * Renders the interior text of [ChatStreamingPreviewSection].
 *
 * @param streamingText Current streaming text string.
 */
@Composable
private fun ChatStreamingCardContent(streamingText: String) {
    Column(modifier = Modifier.padding(12.dp)) {
        Text(
            text = stringResource(Res.string.assistant_streaming),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = streamingText,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

/**
 * Renders the bottom message composer row for [ChatScreen].
 *
 * @param inputText Current text in the input field.
 * @param isLoading Whether a message submission is currently in progress.
 * @param onInputTextChange Callback invoked when the input text changes.
 * @param onSendMessage Callback invoked when the Send button is clicked.
 */
@Composable
private fun ChatComposerRow(
    inputText: String,
    isLoading: Boolean,
    onInputTextChange: (String) -> Unit,
    onSendMessage: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = inputText,
            onValueChange = onInputTextChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(Res.string.ask_a_query)) },
            shape = RoundedCornerShape(24.dp),
            maxLines = 4,
            trailingIcon = {
                IconButton(
                    onClick = onSendMessage,
                    enabled = inputText.isNotBlank() && !isLoading
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.Send,
                        contentDescription = stringResource(Res.string.send),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
        )
    }
}

/**
 * Renders the dialog listing saved conversations with selection and deletion actions.
 *
 * @param conversations List of saved [ConversationResponse] items.
 * @param onDismiss Callback invoked when the dialog is dismissed.
 * @param onSelectConversation Callback invoked when a conversation is selected.
 * @param onDeleteConversation Callback invoked when a conversation's delete button is clicked.
 */
@Composable
private fun ChatConversationsHistoryDialog(
    conversations: List<ConversationResponse>,
    onDismiss: () -> Unit,
    onSelectConversation: (ConversationResponse) -> Unit,
    onDeleteConversation: (String) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(Res.string.conversations_history)) },
        text = {
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                items(conversations) { conv ->
                    ChatConversationHistoryRow(
                        conversation = conv,
                        onSelect = { onSelectConversation(conv) },
                        onDelete = { onDeleteConversation(conv.id) }
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(Res.string.close)) }
        }
    )
}

/**
 * Renders a single row in [ChatConversationsHistoryDialog].
 *
 * @param conversation Target [ConversationResponse].
 * @param onSelect Callback invoked when the conversation title button is clicked.
 * @param onDelete Callback invoked when the delete icon button is clicked.
 */
@Composable
private fun ChatConversationHistoryRow(
    conversation: ConversationResponse,
    onSelect: () -> Unit,
    onDelete: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        TextButton(
            onClick = onSelect,
            modifier = Modifier.weight(1f)
        ) {
            Text(
                resolveConversationRowTitle(conversation, stringResource(Res.string.untitled)),
                maxLines = 1
            )
        }
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Filled.Delete,
                contentDescription = stringResource(Res.string.delete),
                tint = MaterialTheme.colorScheme.error
            )
        }
    }
}

/**
 * A single message bubble displaying the content, inline read-only DuckDB SQL execution preview,
 * and any competing model candidate variations.
 *
 * @param message The chat message entity.
 * @param sqlExecutionResults Map of message/candidate IDs to read-only DuckDB [SQLExecutionResponse] previews.
 * @param onVoteCandidate Optional callback when voting for a model candidate.
 * @param onStageToCart Optional callback when staging generated SQL to the query cart.
 * @param onExecuteSql Optional callback when running a SQL snippet on read-only DuckDB.
 */
@Composable
fun ChatBubble(
    message: MessageResponse,
    sqlExecutionResults: Map<String, SQLExecutionResponse> = emptyMap(),
    onVoteCandidate: ((candidateId: String) -> Unit)? = null,
    onStageToCart: ((title: String, sql: String) -> Unit)? = null,
    onExecuteSql: ((key: String, sql: String) -> Unit)? = null
) {
    val isUser = message.role == "user"
    var showCandidates by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 340.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isUser) 16.dp else 4.dp,
                        bottomEnd = if (isUser) 4.dp else 16.dp
                    )
                )
                .background(
                    if (isUser) MaterialTheme.colorScheme.primaryContainer
                    else MaterialTheme.colorScheme.surfaceVariant
                )
                .padding(12.dp)
        ) {
            Column {
                Text(
                    text = message.content,
                    color = if (isUser) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyLarge
                )

                val snippet = message.sqlSnippet
                if (!snippet.isNullOrBlank()) {
                    ChatPrimarySqlSnippetSection(
                        messageId = message.id,
                        snippet = snippet,
                        sqlPreview = sqlExecutionResults[message.id],
                        onStageToCart = onStageToCart,
                        onExecuteSql = onExecuteSql
                    )
                }

                val candidateList = message.candidates
                if (!candidateList.isNullOrEmpty()) {
                    ChatCandidateVariationsSection(
                        candidateList = candidateList,
                        sqlExecutionResults = sqlExecutionResults,
                        showCandidates = showCandidates,
                        onToggleShowCandidates = { showCandidates = !showCandidates },
                        onVoteCandidate = onVoteCandidate,
                        onStageToCart = onStageToCart,
                        onExecuteSql = onExecuteSql
                    )
                }
            }
        }
    }
}

/**
 * Renders an inline read-only DuckDB execution preview or error message inside a chat bubble.
 *
 * @param preview [SQLExecutionResponse] returned by `/api/v1/ai/execute`, or null if not yet run.
 */
@Composable
internal fun ChatSqlPreviewBox(preview: SQLExecutionResponse?) {
    if (preview != null) {
        Spacer(modifier = Modifier.height(4.dp))
        val err = preview.error
        if (!err.isNullOrBlank()) {
            Text(
                text = stringResource(Res.string.chat_sql_preview_error_fmt, err),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
        } else {
            Text(
                text = stringResource(Res.string.chat_sql_preview_rows_fmt, preview.data.size),
                color = MaterialTheme.colorScheme.primary,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
        }
    }
}

/**
 * Renders the primary SQL snippet, optional Run on DuckDB button, and optional stage-to-cart button inside [ChatBubble].
 *
 * @param messageId Parent message UUID used as the preview key.
 * @param snippet Non-blank SQL snippet string.
 * @param sqlPreview Optional [SQLExecutionResponse] preview for this message.
 * @param onStageToCart Optional callback invoked with `(title, sql)` when staging to the query cart.
 * @param onExecuteSql Optional callback invoked with `(key, sql)` when executing on read-only DuckDB.
 */
@Composable
private fun ColumnScope.ChatPrimarySqlSnippetSection(
    messageId: String,
    snippet: String,
    sqlPreview: SQLExecutionResponse?,
    onStageToCart: ((title: String, sql: String) -> Unit)?,
    onExecuteSql: ((key: String, sql: String) -> Unit)?
) {
    Spacer(modifier = Modifier.height(8.dp))
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(8.dp)
            )
            .padding(8.dp)
    ) {
        Text(
            text = snippet,
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.bodySmall
        )
    }
    ChatSqlPreviewBox(sqlPreview)
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End
    ) {
        if (onExecuteSql != null) {
            TextButton(onClick = { onExecuteSql(messageId, snippet) }) {
                Text(stringResource(Res.string.chat_run_on_duckdb))
            }
        }
        if (onStageToCart != null) {
            val defaultChatQueryTitle = stringResource(Res.string.chat_query_default_title)
            TextButton(onClick = { onStageToCart(defaultChatQueryTitle, snippet) }) {
                Text(stringResource(Res.string.stage_to_cart))
            }
        }
    }
}

/**
 * Renders the expandable model variations toggle and candidate cards inside [ChatBubble].
 *
 * @param candidateList Non-empty list of [MessageCandidateResponse] entries.
 * @param sqlExecutionResults Map of candidate IDs to read-only DuckDB [SQLExecutionResponse] previews.
 * @param showCandidates Whether the candidate cards are currently expanded.
 * @param onToggleShowCandidates Callback invoked to toggle candidate expansion.
 * @param onVoteCandidate Optional callback invoked when voting for a candidate.
 * @param onStageToCart Optional callback invoked when staging a candidate's SQL to the query cart.
 * @param onExecuteSql Optional callback invoked when executing a candidate's SQL on read-only DuckDB.
 */
@Composable
private fun ChatCandidateVariationsSection(
    candidateList: List<MessageCandidateResponse>,
    sqlExecutionResults: Map<String, SQLExecutionResponse>,
    showCandidates: Boolean,
    onToggleShowCandidates: () -> Unit,
    onVoteCandidate: ((candidateId: String) -> Unit)?,
    onStageToCart: ((title: String, sql: String) -> Unit)?,
    onExecuteSql: ((key: String, sql: String) -> Unit)?
) {
    Spacer(modifier = Modifier.height(8.dp))
    TextButton(onClick = onToggleShowCandidates) {
        Text(
            text = if (showCandidates) {
                stringResource(Res.string.hide_variations)
            } else {
                stringResource(Res.string.chat_model_variations_count, candidateList.size)
            },
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.tertiary
        )
    }

    if (showCandidates) {
        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
        ) {
            candidateList.forEach { candidate ->
                ChatCandidateCard(
                    candidate = candidate,
                    sqlPreview = sqlExecutionResults[candidate.id],
                    onVoteCandidate = onVoteCandidate,
                    onStageToCart = onStageToCart,
                    onExecuteSql = onExecuteSql
                )
            }
        }
    }
}

/**
 * Renders a single competing model candidate card inside [ChatCandidateVariationsSection].
 *
 * @param candidate The [MessageCandidateResponse] item to display.
 * @param sqlPreview Optional [SQLExecutionResponse] preview for this candidate.
 * @param onVoteCandidate Optional callback invoked with `candidate.id` when voting as best.
 * @param onStageToCart Optional callback invoked with `(title, sql)` when staging candidate SQL.
 * @param onExecuteSql Optional callback invoked with `(candidate.id, sql)` when executing on read-only DuckDB.
 */
@Composable
private fun ChatCandidateCard(
    candidate: MessageCandidateResponse,
    sqlPreview: SQLExecutionResponse?,
    onVoteCandidate: ((candidateId: String) -> Unit)?,
    onStageToCart: ((title: String, sql: String) -> Unit)?,
    onExecuteSql: ((key: String, sql: String) -> Unit)?
) {
    val candStateDesc = if (candidate.isSelected) {
        stringResource(Res.string.chat_candidate_selected_state)
    } else {
        stringResource(Res.string.chat_candidate_unselected_state)
    }
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .semantics { stateDescription = candStateDesc }
    ) {
        Column(modifier = Modifier.padding(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = candidate.modelName,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = if (candidate.isSelected) {
                        stringResource(Res.string.winner_badge)
                    } else {
                        ""
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.tertiary
                )
            }
            val candSql = candidate.sqlSnippet
            if (!candSql.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = candSql,
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall
                )
            }
            ChatSqlPreviewBox(sqlPreview)
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                if (!candSql.isNullOrBlank() && onExecuteSql != null) {
                    TextButton(onClick = { onExecuteSql(candidate.id, candSql) }) {
                        Text(stringResource(Res.string.chat_run_on_duckdb))
                    }
                }
                if (!candSql.isNullOrBlank() && onStageToCart != null) {
                    val candTitle = stringResource(Res.string.chat_candidate_sql_title, candidate.modelName)
                    TextButton(onClick = { onStageToCart(candTitle, candSql) }) {
                        Text(stringResource(Res.string.stage))
                    }
                }
                if (onVoteCandidate != null) {
                    Button(onClick = { onVoteCandidate(candidate.id) }) {
                        Text(stringResource(Res.string.vote_as_best))
                    }
                }
            }
        }
    }
}
