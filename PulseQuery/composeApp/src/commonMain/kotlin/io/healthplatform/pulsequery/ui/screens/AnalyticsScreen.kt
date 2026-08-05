/**
 * Component for rendering the AnalyticsScreen.
 * Provides the main user interface for this screen.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.LlmOutputAnalyticsRow
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Screen displaying high-level analytics about LLM output and usage.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen() {
    var records by remember { mutableStateOf<List<LlmOutputAnalyticsRow>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val scope = rememberCoroutineScope()
    val unknownErrorMsg = stringResource(Res.string.unknown_error)

    fun loadAnalytics() {
        scope.launch {
            isLoading = true
            errorMessage = null
            try {
                val response = AppContainer.analyticsApi.listLlmOutputsApiV1AnalyticsLlmGet(limit = 100)
                records = response.body()
            } catch (e: Exception) {
                errorMessage = e.message ?: unknownErrorMsg
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
                title = { Text(stringResource(Res.string.llm_analytics)) },
                actions = {
                    IconButton(onClick = { loadAnalytics() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = stringResource(Res.string.refresh))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                )
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            when {
                isLoading -> CircularProgressIndicator()
                errorMessage != null -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { loadAnalytics() }) { Text(stringResource(Res.string.retry)) }
                    }
                }
                records.isEmpty() -> Text(stringResource(Res.string.no_analytics_data), style = MaterialTheme.typography.bodyLarge)
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(records) { record ->
                            AnalyticsRowElevatedCard(record)
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
fun AnalyticsRowElevatedCard(record: LlmOutputAnalyticsRow) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = stringResource(Res.string.model_msg, record.llm),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                if (record.isSelected) {
                    Surface(
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = stringResource(Res.string.selected),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(Res.string.query_msg, record.queryText ?: "N/A"),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(Res.string.user_msg, record.userEmail),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
