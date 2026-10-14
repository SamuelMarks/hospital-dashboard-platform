/**
 * Component for rendering the ChatScreen.
 * Provides the main user interface for conversational SQL generation and model arena evaluation,
 * delegating all state and SSE streaming to [ChatViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.MessageResponse
import io.healthplatform.pulsequery.ui.screens.chat.ChatViewModel
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.ask_a_query
import pulsequery.composeapp.generated.resources.close
import pulsequery.composeapp.generated.resources.conversations_history
import pulsequery.composeapp.generated.resources.delete
import pulsequery.composeapp.generated.resources.history
import pulsequery.composeapp.generated.resources.new_chat
import pulsequery.composeapp.generated.resources.new_conversation
import pulsequery.composeapp.generated.resources.send
import pulsequery.composeapp.generated.resources.start_a_new_conversation
import pulsequery.composeapp.generated.resources.untitled

/**
 * Main chat interface for querying the system using natural language.
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
    val vm = remember(viewModel, conversationId) {
        viewModel ?: ChatViewModel(initialConversationId = conversationId, scope = coroutineScope)
    }

    val uiState by vm.state.collectAsState()
    var showConversationsDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(vm) {
        vm.loadConversations()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(uiState.activeConversation?.title ?: stringResource(Res.string.new_chat)) },
                actions = {
                    IconButton(onClick = { vm.selectConversation(null) }) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.new_conversation))
                    }
                    IconButton(onClick = { showConversationsDialog = true }) {
                        Icon(Icons.AutoMirrored.Filled.List, contentDescription = stringResource(Res.string.history))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { paddingValues ->
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
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
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
                if (uiState.messages.isEmpty() && !uiState.isLoading) {
                    item {
                        Box(modifier = Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                            Text(
                                stringResource(Res.string.start_a_new_conversation),
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                items(uiState.messages) { message ->
                    ChatBubble(
                        message = message,
                        onVoteCandidate = { candidateId ->
                            vm.voteCandidate(message.id, candidateId)
                        },
                        onStageToCart = { title, sql ->
                            vm.stageToCart(title, sql)
                        }
                    )
                }

                val streamingText = uiState.streamingCandidateText
                if (streamingText != null) {
                    item {
                        Card(
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            ),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = "Assistant (Streaming...)",
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
                    }
                }
            }

            if (uiState.isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = uiState.inputText,
                    onValueChange = { vm.updateInputText(it) },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(Res.string.ask_a_query)) },
                    shape = RoundedCornerShape(24.dp),
                    maxLines = 4,
                    trailingIcon = {
                        IconButton(
                            onClick = { vm.sendMessage() },
                            enabled = uiState.inputText.isNotBlank() && !uiState.isLoading
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

        if (showConversationsDialog) {
            AlertDialog(
                onDismissRequest = { showConversationsDialog = false },
                title = { Text(stringResource(Res.string.conversations_history)) },
                text = {
                    LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 400.dp)) {
                        items(uiState.conversations) { conv ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TextButton(
                                    onClick = {
                                        vm.selectConversation(conv)
                                        showConversationsDialog = false
                                    },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text(conv.title ?: stringResource(Res.string.untitled), maxLines = 1)
                                }
                                IconButton(onClick = { vm.deleteConversation(conv.id) }) {
                                    Icon(
                                        Icons.Filled.Delete,
                                        contentDescription = stringResource(Res.string.delete),
                                        tint = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showConversationsDialog = false }) { Text(stringResource(Res.string.close)) }
                }
            )
        }
    }
}

/**
 * A single message bubble displaying the content and any competing model candidate variations.
 *
 * @param message The chat message entity.
 * @param onVoteCandidate Optional callback when voting for a model candidate.
 * @param onStageToCart Optional callback when staging generated SQL to the query cart.
 */
@Composable
fun ChatBubble(
    message: MessageResponse,
    onVoteCandidate: ((candidateId: String) -> Unit)? = null,
    onStageToCart: ((title: String, sql: String) -> Unit)? = null
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
                    if (onStageToCart != null) {
                        Spacer(modifier = Modifier.height(4.dp))
                        TextButton(
                            onClick = { onStageToCart("Chat Query", snippet) },
                            modifier = Modifier.align(Alignment.End)
                        ) {
                            Text("Stage to Cart")
                        }
                    }
                }

                val candidateList = message.candidates
                if (!candidateList.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(onClick = { showCandidates = !showCandidates }) {
                        Text(
                            text = if (showCandidates) "Hide Variations" else "${candidateList.size} Model Variations",
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
                                Card(
                                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                                    modifier = Modifier.fillMaxWidth()
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
                                                text = if (candidate.isSelected) "Winner" else "",
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
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.End
                                        ) {
                                            if (!candSql.isNullOrBlank() && onStageToCart != null) {
                                                TextButton(onClick = { onStageToCart("${candidate.modelName} SQL", candSql) }) {
                                                    Text("Stage")
                                                }
                                            }
                                            if (onVoteCandidate != null) {
                                                Button(onClick = { onVoteCandidate(candidate.id) }) {
                                                    Text("Vote as Best")
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
