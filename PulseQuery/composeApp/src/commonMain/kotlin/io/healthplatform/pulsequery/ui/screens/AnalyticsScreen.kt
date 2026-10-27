/**
 * Component for rendering the AnalyticsScreen.
 * Provides the main user interface for LLM usage analytics,
 * delegating all state and API calls to [AnalyticsViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.LlmOutputAnalyticsRow
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsViewModel
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.alert_rules
import pulsequery.composeapp.generated.resources.bed_capacity_alert_rules
import pulsequery.composeapp.generated.resources.bed_capacity_alert_rules_desc
import pulsequery.composeapp.generated.resources.configure
import pulsequery.composeapp.generated.resources.database_misconfiguration
import pulsequery.composeapp.generated.resources.llm_analytics
import pulsequery.composeapp.generated.resources.model_msg
import pulsequery.composeapp.generated.resources.no_analytics_data
import pulsequery.composeapp.generated.resources.query_msg
import pulsequery.composeapp.generated.resources.refresh
import pulsequery.composeapp.generated.resources.retry
import pulsequery.composeapp.generated.resources.selected
import pulsequery.composeapp.generated.resources.unknown_error
import pulsequery.composeapp.generated.resources.user_msg

/**
 * Screen displaying high-level analytics about LLM output and usage.
 *
 * @param onNavigateToAlertRules Callback invoked to navigate to bed capacity alert rules screen.
 * @param viewModel Optional [AnalyticsViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnalyticsScreen(
    onNavigateToAlertRules: () -> Unit = {},
    viewModel: AnalyticsViewModel? = null
) {
    val scope = rememberCoroutineScope()
    val vm = remember(viewModel, scope) {
        viewModel ?: AnalyticsViewModel(scope = scope)
    }

    val uiState by vm.state.collectAsState()

    val isDatabaseHealthy by AppContainer.networkHealthRepository.isDatabaseHealthy.collectAsState()
    val healthState by AppContainer.networkHealthRepository.healthState.collectAsState()

    val unknownErrorMsg = stringResource(Res.string.unknown_error)

    LaunchedEffect(vm) {
        vm.loadAnalytics(fallbackError = unknownErrorMsg)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(Res.string.llm_analytics),
                        modifier = Modifier.semantics { heading() }
                    )
                },
                actions = {
                    TextButton(onClick = onNavigateToAlertRules) {
                        Text(stringResource(Res.string.alert_rules))
                    }
                    IconButton(onClick = { vm.loadAnalytics(fallbackError = unknownErrorMsg) }) {
                        Icon(Icons.Filled.Refresh, contentDescription = stringResource(Res.string.refresh))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            when {
                uiState.isLoading -> CircularProgressIndicator()
                !isDatabaseHealthy -> {
                    val dbMsg = healthState?.duckdb?.error ?: healthState?.postgres?.error
                        ?: "Database service is experiencing storage or configuration errors."
                    DatabaseErrorCard(
                        title = stringResource(Res.string.database_misconfiguration),
                        message = dbMsg,
                        onRetry = {
                            AppContainer.networkHealthRepository.refreshHealth()
                            vm.loadAnalytics(fallbackError = unknownErrorMsg)
                        },
                        modifier = Modifier.padding(16.dp)
                    )
                }
                uiState.errorMessage != null -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }
                    ) {
                        Text(text = uiState.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { vm.loadAnalytics(fallbackError = unknownErrorMsg) }) {
                            Text(stringResource(Res.string.retry))
                        }
                    }
                }
                uiState.records.isEmpty() -> Text(
                    stringResource(Res.string.no_analytics_data),
                    style = MaterialTheme.typography.bodyLarge
                )
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            ElevatedCard(
                                modifier = Modifier.fillMaxWidth(),
                                onClick = onNavigateToAlertRules
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = stringResource(Res.string.bed_capacity_alert_rules),
                                            style = MaterialTheme.typography.titleMedium,
                                            modifier = Modifier.semantics { heading() }
                                        )
                                        Spacer(modifier = Modifier.height(2.dp))
                                        Text(
                                            text = stringResource(Res.string.bed_capacity_alert_rules_desc),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                    TextButton(onClick = onNavigateToAlertRules) {
                                        Text(stringResource(Res.string.configure))
                                    }
                                }
                            }
                        }

                        items(uiState.records) { record ->
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
 *
 * @param record The [LlmOutputAnalyticsRow] to display.
 */
@Composable
fun AnalyticsRowElevatedCard(record: LlmOutputAnalyticsRow) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
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
