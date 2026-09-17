/**
 * Component for rendering the ChatScreen.
 * Provides the main user interface for this screen.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.ConversationCreate
import io.healthplatform.pulsequery.api.models.ConversationResponse
import io.healthplatform.pulsequery.api.models.MessageCreate
import io.healthplatform.pulsequery.api.models.MessageResponse
import io.healthplatform.pulsequery.api.models.MessageVoteRequest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.ChatStreamEvent
import androidx.compose.ui.text.font.FontFamily
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Main chat interface for querying the system using natural language.
 *
 * @param conversationId Optional existing conversation ID to load. If null, starts a new conversation.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    conversationId: String? = null
) {
    var activeConversation by remember { mutableStateOf<ConversationResponse?>(null) }
    var conversations by remember { mutableStateOf<List<ConversationResponse>>(emptyList()) }
    var messages by remember { mutableStateOf<List<MessageResponse>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var streamingCandidateText by remember { mutableStateOf<String?>(null) }
    var inputText by remember { mutableStateOf("") }
    var showConversationsDialog by remember { mutableStateOf(false) }
    
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    fun loadConversations() {
        coroutineScope.launch {
            runCatching {
                val response = AppContainer.chatApi.listConversationsApiV1ConversationsGet()
                response.body()
            }.onSuccess { list ->
                conversations = list
                if (activeConversation == null && conversationId != null) {
                    activeConversation = conversations.find { it.id == conversationId }
                }
            }.onFailure { e ->
                println("Failed to load conversations: ${e.message}")
            }
        }
    }

    LaunchedEffect(Unit) {
        loadConversations()
    }

    fun loadMessages() {
        val active = activeConversation ?: run {
            messages = emptyList()
            return
        }
        coroutineScope.launch {
            isLoading = true
            runCatching {
                val response = AppContainer.chatApi.getMessagesApiV1ConversationsConversationIdMessagesGet(
                    conversationId = active.id
                )
                response.body()
            }.onSuccess {
                messages = it
            }.onFailure { e ->
                println("Failed to load messages: ${e.message}")
            }
            isLoading = false
        }
    }

    LaunchedEffect(activeConversation) {
        loadMessages()
    }

    fun deleteConversation(id: String) {
        coroutineScope.launch {
            runCatching {
                AppContainer.chatApi.deleteConversationApiV1ConversationsConversationIdDelete(id)
            }.onSuccess {
                if (activeConversation?.id == id) {
                    activeConversation = null
                    messages = emptyList()
                }
                loadConversations()
            }.onFailure { e ->
                println("Failed to delete conversation: ${e.message}")
            }
        }
    }

    fun sendMessage() {
        if (inputText.isBlank()) return
        
        val textToSend = inputText.trim()
        inputText = ""
        
        coroutineScope.launch {
            isLoading = true
            runCatching {
                if (activeConversation == null) {
                    val response = AppContainer.chatApi.createConversationApiV1ConversationsPost(
                        ConversationCreate(
                            title = textToSend.take(20),
                            message = textToSend
                        )
                    )
                    val detail: io.healthplatform.pulsequery.api.models.ConversationDetail = response.body()
                    activeConversation = io.healthplatform.pulsequery.api.models.ConversationResponse(id = detail.id, userId = detail.userId, createdAt = detail.createdAt, updatedAt = detail.updatedAt, title = detail.title)
                    loadConversations()
                } else {
                    val messagePayload = MessageCreate(content = textToSend)
                    AppContainer.chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost(
                        conversationId = activeConversation!!.id,
                        messageCreate = messagePayload
                    )
                    loadMessages()
                }
            }.onFailure { e ->
                println("Failed to send message: ${e.message}")
            }
            isLoading = false
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(activeConversation?.title ?: stringResource(Res.string.new_chat)) },
                actions = {
                    IconButton(onClick = { 
                        activeConversation = null
                        messages = emptyList()
                    }) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.new_conversation))
                    }
                    IconButton(onClick = { showConversationsDialog = true }) {
                        Icon(Icons.AutoMirrored.Filled.List, contentDescription = stringResource(Res.string.history))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                contentPadding = PaddingValues(vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (messages.isEmpty() && !isLoading) {
                    item {
                        Box(modifier = Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                            Text(stringResource(Res.string.start_a_new_conversation), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                items(messages) { message ->
                    ChatBubble(
                        message = message,
                        onVoteCandidate = { candidateId ->
                            val convId = activeConversation?.id ?: return@ChatBubble
                            coroutineScope.launch {
                                runCatching {
                                    AppContainer.chatApi.voteCandidateApiV1ConversationsConversationIdMessagesMessageIdVotePost(
                                        conversationId = convId,
                                        messageId = message.id,
                                        messageVoteRequest = MessageVoteRequest(candidateId = candidateId)
                                    )
                                }.fold(
                                    onSuccess = {
                                        snackbarHostState.showSnackbar("Vote recorded successfully")
                                    },
                                    onFailure = { e ->
                                        snackbarHostState.showSnackbar(e.message ?: "Failed to record vote")
                                    }
                                )
                            }
                        },
                        onStageToCart = { title, sql ->
                            AppContainer.queryCartRepository.addQuery(title, sql)
                            coroutineScope.launch {
                                snackbarHostState.showSnackbar("Query staged to cart")
                            }
                        }
                    )
                }

                if (streamingCandidateText != null) {
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
                                    text = streamingCandidateText!!,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                    }
                }
            }

            if (isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = inputText,
                    onValueChange = { inputText = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text(stringResource(Res.string.ask_a_query)) },
                    shape = RoundedCornerShape(24.dp),
                    maxLines = 4,
                    trailingIcon = {
                        IconButton(onClick = { sendMessage() }, enabled = inputText.isNotBlank() && !isLoading) {
                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = stringResource(Res.string.send), tint = MaterialTheme.colorScheme.primary)
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
                        items(conversations) { conv ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TextButton(
                                    onClick = {
                                        activeConversation = conv
                                        showConversationsDialog = false
                                    },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Text(conv.title ?: stringResource(Res.string.untitled), maxLines = 1)
                                }
                                IconButton(onClick = { deleteConversation(conv.id) }) {
                                    Icon(Icons.Filled.Delete, contentDescription = stringResource(Res.string.delete), tint = MaterialTheme.colorScheme.error)
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

                if (!message.sqlSnippet.isNullOrBlank()) {
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
                            text = message.sqlSnippet!!,
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    if (onStageToCart != null) {
                        Spacer(modifier = Modifier.height(4.dp))
                        TextButton(
                            onClick = { onStageToCart("Chat Query", message.sqlSnippet!!) },
                            modifier = Modifier.align(Alignment.End)
                        ) {
                            Text("Stage to Cart")
                        }
                    }
                }

                if (!message.candidates.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    TextButton(onClick = { showCandidates = !showCandidates }) {
                        Text(
                            text = if (showCandidates) "Hide Variations" else "${message.candidates!!.size} Model Variations",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.tertiary
                        )
                    }

                    if (showCandidates) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                        ) {
                            message.candidates!!.forEach { candidate ->
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
                                                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                                            )
                                            Text(
                                                text = if (candidate.isSelected) "Winner" else "",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.tertiary
                                            )
                                        }
                                        if (!candidate.sqlSnippet.isNullOrBlank()) {
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text(
                                                text = candidate.sqlSnippet!!,
                                                fontFamily = FontFamily.Monospace,
                                                style = MaterialTheme.typography.bodySmall
                                            )
                                        }
                                        Spacer(modifier = Modifier.height(6.dp))
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.End
                                        ) {
                                            if (!candidate.sqlSnippet.isNullOrBlank() && onStageToCart != null) {
                                                TextButton(onClick = { onStageToCart("${candidate.modelName} SQL", candidate.sqlSnippet!!) }) {
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
