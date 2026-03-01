package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.LlmOutputAnalyticsRow
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Screen displaying high-level analytics about LLM output and usage.
 * Includes a list of recent candidates and user interactions.
 *
 * @param onNavigateBack Action to return to the previous screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(onNavigateBack: () -> Unit) {
    var records by remember { mutableStateOf<List<LlmOutputAnalyticsRow>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val scope = rememberCoroutineScope()

    fun loadAnalytics() {
        scope.launch {
            isLoading = true
            errorMessage = null
            try {
                val response = AppContainer.analyticsApi.listLlmOutputsApiV1AnalyticsLlmGet(limit = 100)
                records = response.body()
            } catch (e: Exception) {
                errorMessage = e.message ?: "Unknown error occurred"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadAnalytics()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("LLM Analytics") },
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
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            when {
                isLoading -> CircularProgressIndicator()
                errorMessage != null -> Text(text = "Error: $errorMessage", color = MaterialTheme.colorScheme.error)
                records.isEmpty() -> Text("No analytics data available.")
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(records) { record ->
                            AnalyticsRowCard(record)
                        }
                    }
                }
            }
        }
    }
}

/**
 * Formats a single analytics row describing an LLM output event.
 */
@Composable
fun AnalyticsRowCard(record: LlmOutputAnalyticsRow) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    text = "Model: ${record.llm}",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                if (record.isSelected) {
                    Text(
                        text = "Selected",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Query: ${record.queryText ?: "N/A"}",
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "User: ${record.userEmail}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}