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
import io.healthplatform.pulsequery.api.models.SystemHealthResponse
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsUiState
import io.healthplatform.pulsequery.ui.screens.analytics.AnalyticsViewModel
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.alert_rules
import pulsequery.composeapp.generated.resources.analytics_na_fallback
import pulsequery.composeapp.generated.resources.bed_capacity_alert_rules
import pulsequery.composeapp.generated.resources.bed_capacity_alert_rules_desc
import pulsequery.composeapp.generated.resources.configure
import pulsequery.composeapp.generated.resources.database_default_error
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
 * Resolves the diagnostic database error message from [SystemHealthResponse], falling back to [defaultError].
 *
 * @param healthState Optional system health payload.
 * @param defaultError Localized fallback error string.
 * @return Specific database error string or [defaultError].
 */
internal fun resolveAnalyticsDatabaseErrorMessage(
    healthState: SystemHealthResponse?,
    defaultError: String
): String {
    if (healthState == null) return defaultError
    return healthState.duckdb.error ?: healthState.postgres.error ?: defaultError
}

/**
 * Refreshes network/database health and reloads LLM analytics records.
 *
 * @param vm Target [AnalyticsViewModel] instance.
 * @param fallbackError Localized fallback error string.
 */
internal fun retryDatabaseAndLoadAnalytics(
    vm: AnalyticsViewModel,
    fallbackError: String
) {
    AppContainer.networkHealthRepository.refreshHealth()
    vm.loadAnalytics(fallbackError = fallbackError)
}

/**
 * Resolves the display query text for an analytics record, falling back to [fallbackText] when null.
 *
 * @param queryText Optional query text from [LlmOutputAnalyticsRow].
 * @param fallbackText Localized N/A fallback string.
 * @return Non-null display query string.
 */
internal fun resolveAnalyticsQueryText(queryText: String?, fallbackText: String): String {
    return queryText ?: fallbackText
}

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
        vm.performLoadAnalytics(fallbackError = unknownErrorMsg)
    }

    Scaffold(
        topBar = {
            AnalyticsTopBar(
                onNavigateToAlertRules = onNavigateToAlertRules,
                onRefresh = { vm.loadAnalytics(fallbackError = unknownErrorMsg) }
            )
        }
    ) { padding ->
        AnalyticsScreenBody(
            uiState = uiState,
            isDatabaseHealthy = isDatabaseHealthy,
            healthState = healthState,
            paddingValues = padding,
            onNavigateToAlertRules = onNavigateToAlertRules,
            onRetryDatabase = {
                retryDatabaseAndLoadAnalytics(vm, unknownErrorMsg)
            },
            onRetryAnalytics = {
                vm.loadAnalytics(fallbackError = unknownErrorMsg)
            }
        )
    }
}

/**
 * Renders the top app bar for [AnalyticsScreen].
 *
 * @param onNavigateToAlertRules Callback invoked when the Alert Rules button is clicked.
 * @param onRefresh Callback invoked when the Refresh icon button is clicked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AnalyticsTopBar(
    onNavigateToAlertRules: () -> Unit,
    onRefresh: () -> Unit
) {
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
            IconButton(onClick = onRefresh) {
                Icon(Icons.Filled.Refresh, contentDescription = stringResource(Res.string.refresh))
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface
        )
    )
}

/**
 * Renders the main body content of [AnalyticsScreen].
 *
 * @param uiState Current [AnalyticsUiState].
 * @param isDatabaseHealthy Whether backend databases are healthy.
 * @param healthState Optional [SystemHealthResponse] diagnostic payload.
 * @param paddingValues Scaffold inner padding.
 * @param onNavigateToAlertRules Callback invoked to navigate to alert rules configuration.
 * @param onRetryDatabase Callback invoked when retrying from database error banner.
 * @param onRetryAnalytics Callback invoked when retrying failed analytics load.
 */
@Composable
private fun AnalyticsScreenBody(
    uiState: AnalyticsUiState,
    isDatabaseHealthy: Boolean,
    healthState: SystemHealthResponse?,
    paddingValues: PaddingValues,
    onNavigateToAlertRules: () -> Unit,
    onRetryDatabase: () -> Unit,
    onRetryAnalytics: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize().padding(paddingValues), contentAlignment = Alignment.Center) {
        when {
            !isDatabaseHealthy -> {
                val dbMsg = resolveAnalyticsDatabaseErrorMessage(
                    healthState = healthState,
                    defaultError = stringResource(Res.string.database_default_error)
                )
                DatabaseErrorCard(
                    title = stringResource(Res.string.database_misconfiguration),
                    message = dbMsg,
                    onRetry = onRetryDatabase,
                    modifier = Modifier.padding(16.dp)
                )
            }
            uiState.isLoading -> CircularProgressIndicator()
            uiState.errorMessage != null -> {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }
                ) {
                    Text(text = uiState.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(onClick = onRetryAnalytics) {
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
                        AnalyticsAlertRulesBannerCard(onNavigateToAlertRules = onNavigateToAlertRules)
                    }

                    items(uiState.records) { record ->
                        AnalyticsRowElevatedCard(record)
                    }
                }
            }
        }
    }
}

/**
 * Renders the navigation card linking to Bed Capacity Alert Rules from [AnalyticsScreen].
 *
 * @param onNavigateToAlertRules Callback invoked when the card or Configure button is clicked.
 */
@Composable
private fun AnalyticsAlertRulesBannerCard(onNavigateToAlertRules: () -> Unit) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onNavigateToAlertRules
    ) {
        AnalyticsAlertRulesBannerBody(onNavigateToAlertRules = onNavigateToAlertRules)
    }
}

/**
 * Renders the interior row of [AnalyticsAlertRulesBannerCard].
 *
 * @param onNavigateToAlertRules Callback invoked when the Configure button is clicked.
 */
@Composable
private fun AnalyticsAlertRulesBannerBody(onNavigateToAlertRules: () -> Unit) {
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
        AnalyticsRowCardBody(record = record)
    }
}

/**
 * Renders the interior content of [AnalyticsRowElevatedCard].
 *
 * @param record The [LlmOutputAnalyticsRow] to display.
 */
@Composable
private fun AnalyticsRowCardBody(record: LlmOutputAnalyticsRow) {
    val resolvedQuery = resolveAnalyticsQueryText(
        queryText = record.queryText,
        fallbackText = stringResource(Res.string.analytics_na_fallback)
    )
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
                AnalyticsSelectedBadge()
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(Res.string.query_msg, resolvedQuery),
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

/**
 * Renders the "Selected" pill badge inside [AnalyticsRowCardBody].
 */
@Composable
private fun AnalyticsSelectedBadge() {
    Surface(
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = MaterialTheme.shapes.small
    ) {
        AnalyticsSelectedBadgeLabel()
    }
}

/**
 * Renders the text label inside [AnalyticsSelectedBadge].
 */
@Composable
private fun AnalyticsSelectedBadgeLabel() {
    Text(
        text = stringResource(Res.string.selected),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSecondaryContainer,
        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
    )
}
