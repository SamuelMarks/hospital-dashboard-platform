package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.MessageCreate
import io.healthplatform.pulsequery.api.models.MessageResponse
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Main chat interface for querying the system using natural language.
 * Provides a conversational UI mapped to the ChatApi endpoints.
 *
 * @param conversationId Optional existing conversation ID to load. If null, starts a new conversation.
 * @param onNavigateBack Callback when the user clicks the back button in the top bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    conversationId: String? = null,
    onNavigateBack: () -> Unit
) {
    var activeConversationId by remember { mutableStateOf(conversationId) }
    var messages by remember { mutableStateOf<List<MessageResponse>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var inputText by remember { mutableStateOf("") }
    
    val coroutineScope = rememberCoroutineScope()

    /**
     * Fetches historical messages from the API if an active conversation ID is set.
     */
    fun loadMessages() {
        if (activeConversationId == null) return
        coroutineScope.launch {
            isLoading = true
            try {
                val response = AppContainer.chatApi.getMessagesApiV1ConversationsConversationIdMessagesGet(
                    conversationId = activeConversationId!!
                )
                messages = response.body()
            } catch (e: Exception) {
                println("Failed to load messages: ${e.message}")
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(activeConversationId) {
        loadMessages()
    }

    /**
     * Submits a message to the active conversation, or initializes a new one.
     */
    fun sendMessage() {
        if (inputText.isBlank()) return
        
        val textToSend = inputText.trim()
        inputText = "" // Clear input field immediately for responsiveness
        
        coroutineScope.launch {
            isLoading = true
            try {
                if (activeConversationId == null) {
                    val response = AppContainer.chatApi.createConversationApiV1ConversationsPost(
                        io.healthplatform.pulsequery.api.models.ConversationCreate(
                            title = "New Chat",
                            message = textToSend
                        )
                    )
                    val newConversation = response.body()
                    activeConversationId = newConversation.id
                } else {
                    val messagePayload = MessageCreate(content = textToSend)
                    val response = AppContainer.chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost(
                        conversationId = activeConversationId!!,
                        messageCreate = messagePayload
                    )
                    messages = messages + response.body()
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
                title = { Text("PulseQuery Chat") },
                navigationIcon = {
                    TextButton(onClick = onNavigateBack) {
                        Text("< Back", color = MaterialTheme.colorScheme.onPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
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
                    placeholder = { Text("Ask a clinical query...") },
                    shape = RoundedCornerShape(24.dp),
                    maxLines = 4
                )
                Spacer(modifier = Modifier.width(8.dp))
                FloatingActionButton(
                    onClick = { sendMessage() },
                    shape = RoundedCornerShape(16.dp),
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.size(64.dp)
                ) {
                    Text("Send")
                }
            }
        }
    }
}

/**
 * A single message bubble displaying the content.
 * Aligns to the start or end depending on whether the user or system authored it.
 *
 * @param message The domain model representing the chat payload.
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
                        text = "Candidate variations available. (Voting UI placeholder)",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                }
            }
        }
    }
}
