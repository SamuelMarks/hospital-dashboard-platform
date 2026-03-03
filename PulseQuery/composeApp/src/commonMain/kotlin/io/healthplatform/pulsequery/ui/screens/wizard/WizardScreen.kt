package io.healthplatform.pulsequery.ui.screens.wizard

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.ScenarioResult

/**
 * The main entry point for the guided optimization wizard.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WizardScreen() {
    val coroutineScope = rememberCoroutineScope()
    val viewModel = remember { WizardViewModel(coroutineScope) }
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Optimization Assistant") },
                navigationIcon = {
                    if (state !is WizardState.Landing) {
                        IconButton(onClick = { viewModel.reset() }) {
                            Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (val s = state) {
                is WizardState.Landing -> LandingContent(
                    onUseCaseSelected = { viewModel.startScenario(it) }
                )
                is WizardState.ContextGathering -> ChatContent(
                    messages = s.messages,
                    onMessageSent = { viewModel.submitMessage(it) }
                )
                is WizardState.ConstraintIdentification -> SplitScreenContent(
                    messages = s.messages,
                    constraints = s.constraints,
                    onMessageSent = { viewModel.submitMessage(it) }
                )
                is WizardState.Execution -> SplitScreenContent(
                    messages = listOf(WizardMessage(false, s.explanation)),
                    baseResult = s.baseResult,
                    branchResult = s.branchResult,
                    onMessageSent = { viewModel.submitMessage(it) }
                )
                is WizardState.Refinement -> SplitScreenContent(
                    messages = s.messages,
                    baseResult = s.baseResult,
                    branchResult = s.branchResult,
                    onMessageSent = { viewModel.submitMessage(it) }
                )
            }
        }
    }
}

@Composable
fun LandingContent(onUseCaseSelected: (WizardUseCase) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("What would you like to optimize today?", style = MaterialTheme.typography.headlineMedium)
        WizardUseCase.values().forEach { useCase ->
            ElevatedCard(
                modifier = Modifier.fillMaxWidth(0.8f),
                onClick = { onUseCaseSelected(useCase) }
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(useCase.title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(useCase.description, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
fun ChatContent(messages: List<WizardMessage>, onMessageSent: (String) -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(16.dp),
            contentPadding = PaddingValues(vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(messages) { message ->
                WizardChatBubble(message)
            }
        }
        MessageInputRow(onMessageSent)
    }
}

@Composable
fun SplitScreenContent(
    messages: List<WizardMessage>,
    constraints: List<String> = emptyList(),
    baseResult: ScenarioResult? = null,
    branchResult: ScenarioResult? = null,
    onMessageSent: (String) -> Unit
) {
    Row(modifier = Modifier.fillMaxSize()) {
        // Left Panel: Chat
        Column(modifier = Modifier.weight(1f).fillMaxHeight().background(MaterialTheme.colorScheme.surface)) {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(messages) { message ->
                    WizardChatBubble(message)
                }
            }
            MessageInputRow(onMessageSent)
        }

        // Divider
        Divider(modifier = Modifier.fillMaxHeight().width(1.dp))

        // Right Panel: Visuals/Branching
        Column(modifier = Modifier.weight(1f).fillMaxHeight().padding(16.dp)) {
            Text("Simulation Workspace", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            Spacer(modifier = Modifier.height(16.dp))
            
            if (constraints.isNotEmpty()) {
                Text("Detected Constraints:", fontWeight = FontWeight.Bold)
                constraints.forEach { c ->
                    Text("- $c", style = MaterialTheme.typography.bodyMedium)
                }
                Spacer(modifier = Modifier.height(16.dp))
            }
            
            if (baseResult != null) {
                Text("Base Scenario Output:", fontWeight = FontWeight.Bold)
                Text(baseResult.status)
                Spacer(modifier = Modifier.height(8.dp))
            }

            if (branchResult != null) {
                ElevatedCard(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp), colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Branch Scenario Output (Optimized):", fontWeight = FontWeight.Bold)
                        Text(branchResult.status)
                    }
                }
            }
        }
    }
}

@Composable
fun WizardChatBubble(message: WizardMessage) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.isUser) Arrangement.End else Arrangement.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 340.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (message.isUser) 16.dp else 4.dp,
                        bottomEnd = if (message.isUser) 4.dp else 16.dp
                    )
                )
                .background(
                    if (message.isUser) MaterialTheme.colorScheme.primaryContainer 
                    else MaterialTheme.colorScheme.surfaceVariant
                )
                .padding(12.dp)
        ) {
            Text(
                text = message.text,
                color = if (message.isUser) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyLarge
            )
        }
    }
}

@Composable
fun MessageInputRow(onMessageSent: (String) -> Unit) {
    var inputText by remember { mutableStateOf("") }
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
            placeholder = { Text("Describe changes...") },
            shape = RoundedCornerShape(24.dp),
            trailingIcon = {
                IconButton(onClick = {
                    if (inputText.isNotBlank()) {
                        onMessageSent(inputText)
                        inputText = ""
                    }
                }) {
                    Icon(Icons.Filled.Send, contentDescription = "Send")
                }
            }
        )
    }
}
