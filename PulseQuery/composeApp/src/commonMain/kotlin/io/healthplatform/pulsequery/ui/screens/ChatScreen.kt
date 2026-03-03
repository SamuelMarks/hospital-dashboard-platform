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
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Send
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
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

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
    var inputText by remember { mutableStateOf("") }
    var showConversationsDialog by remember { mutableStateOf(false) }
    
    val coroutineScope = rememberCoroutineScope()

    fun loadConversations() {
        coroutineScope.launch {
            try {
                val response = AppContainer.chatApi.listConversationsApiV1ConversationsGet()
                conversations = response.body()
                if (activeConversation == null && conversationId != null) {
                    activeConversation = conversations.find { it.id == conversationId }
                }
            } catch (e: Exception) {
                println("Failed to load conversations: ${e.message}")
            }
        }
    }

    LaunchedEffect(Unit) {
        loadConversations()
    }

    fun loadMessages() {
        if (activeConversation == null) {
            messages = emptyList()
            return
        }
        coroutineScope.launch {
            isLoading = true
            try {
                val response = AppContainer.chatApi.getMessagesApiV1ConversationsConversationIdMessagesGet(
                    conversationId = activeConversation!!.id
                )
                messages = response.body()
            } catch (e: Exception) {
                println("Failed to load messages: ${e.message}")
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(activeConversation) {
        loadMessages()
    }

    fun deleteConversation(id: String) {
        coroutineScope.launch {
            try {
                AppContainer.chatApi.deleteConversationApiV1ConversationsConversationIdDelete(id)
                if (activeConversation?.id == id) {
                    activeConversation = null
                    messages = emptyList()
                }
                loadConversations()
            } catch (e: Exception) {
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
            try {
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
            } catch (e: Exception) {
                println("Failed to send message: ${e.message}")
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(activeConversation?.title ?: "New Chat") },
                actions = {
                    IconButton(onClick = { 
                        activeConversation = null
                        messages = emptyList()
                    }) {
                        Icon(Icons.Filled.Add, contentDescription = "New Conversation")
                    }
                    IconButton(onClick = { showConversationsDialog = true }) {
                        Icon(Icons.Filled.List, contentDescription = "History")
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
                            Text("Start a new conversation", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                items(messages) { message ->
                    ChatBubble(message = message)
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
                    placeholder = { Text("Ask a query...") },
                    shape = RoundedCornerShape(24.dp),
                    maxLines = 4,
                    trailingIcon = {
                        IconButton(onClick = { sendMessage() }, enabled = inputText.isNotBlank() && !isLoading) {
                            Icon(Icons.Filled.Send, contentDescription = "Send", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                )
            }
        }

        if (showConversationsDialog) {
            AlertDialog(
                onDismissRequest = { showConversationsDialog = false },
                title = { Text("Conversations History") },
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
                                    Text(conv.title ?: "Untitled", maxLines = 1)
                                }
                                IconButton(onClick = { deleteConversation(conv.id) }) {
                                    Icon(Icons.Filled.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { showConversationsDialog = false }) { Text("Close") }
                }
            )
        }
    }
}

/**
 * A single message bubble displaying the content.
 */
@Composable
fun ChatBubble(message: MessageResponse) {
    val isUser = message.role == "user"
    
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 300.dp)
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
                
                if (!message.candidates.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Candidate variations available.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                }
            }
        }
    }
}
