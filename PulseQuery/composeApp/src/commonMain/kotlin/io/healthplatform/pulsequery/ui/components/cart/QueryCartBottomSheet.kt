/**
 * Query Cart Bottom Sheet module enabling clinicians to review and batch-deploy staged SQL queries.
 */
package io.healthplatform.pulsequery.ui.components.cart

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.result.asResultMap
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runResultPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.StagedQuery
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.cart_add_widgets_fmt
import pulsequery.composeapp.generated.resources.cart_empty_message
import pulsequery.composeapp.generated.resources.clear_all
import pulsequery.composeapp.generated.resources.query_cart
import pulsequery.composeapp.generated.resources.remove_from_cart

/**
 * Batch-provisions a list of [StagedQuery] items as SQL widgets onto a target dashboard.
 *
 * @param dashboardId Target dashboard UUID.
 * @param queries Ordered list of staged queries to deploy.
 * @return [Result] indicating batch completion or the first encountered error.
 */
internal suspend fun deployStagedQueriesToDashboard(
    dashboardId: String,
    queries: List<StagedQuery>
): Result<Unit> {
    return runResultPulseAsync {
        var batchResult: Result<Unit> = Result.success(Unit)
        for (query in queries) {
            val widgetIn = WidgetIn.Sql(
                title = query.title,
                visualization = query.visualization,
                config = SqlConfig(query = query.sql)
            )
            val singleRes = AppContainer.dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(
                dashboardId,
                widgetIn
            ).asResultMap { }
            if (singleRes.isFailure) {
                batchResult = singleRes
                break
            }
        }
        batchResult
    }
}

/**
 * Modal Bottom Sheet allowing users to review staged queries in their cart,
 * remove queries, or batch-provision them into an active dashboard.
 *
 * @param activeDashboardId ID of active dashboard to deploy to, if available.
 * @param onDismiss Callback to dismiss bottom sheet.
 * @param onQueriesDeployed Callback executed when queries are successfully created.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueryCartBottomSheet(
    activeDashboardId: String? = null,
    onDismiss: () -> Unit = {},
    onQueriesDeployed: () -> Unit = {}
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss
    ) {
        QueryCartSheetContent(
            activeDashboardId = activeDashboardId,
            onDismiss = onDismiss,
            onQueriesDeployed = onQueriesDeployed
        )
    }
}

/**
 * Renders the interior content of [QueryCartBottomSheet] so it can be tested both inside and outside a modal sheet.
 *
 * @param activeDashboardId ID of active dashboard to deploy to, if available.
 * @param onDismiss Callback to dismiss bottom sheet.
 * @param onQueriesDeployed Callback executed when queries are successfully created.
 */
@Composable
internal fun QueryCartSheetContent(
    activeDashboardId: String? = null,
    onDismiss: () -> Unit = {},
    onQueriesDeployed: () -> Unit = {}
) {
    val stagedQueries by AppContainer.queryCartRepository.stagedQueries.collectAsState()
    val scope = rememberCoroutineScope()
    var isDeploying by remember { mutableStateOf(false) }
    var deployError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "${stringResource(Res.string.query_cart)} (${stagedQueries.size})",
                style = MaterialTheme.typography.titleLarge
            )

            if (stagedQueries.isNotEmpty()) {
                TextButton(onClick = { AppContainer.queryCartRepository.clearCart() }) {
                    Text(stringResource(Res.string.clear_all))
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        deployError?.let { errorText ->
            Text(
                text = errorText,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        if (stagedQueries.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(Res.string.cart_empty_message),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false)
            ) {
                items(stagedQueries) { query ->
                    StagedQueryCard(query = query)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (!activeDashboardId.isNullOrBlank()) {
                Button(
                    onClick = {
                        scope.launch {
                            isDeploying = true
                            deployError = null
                            deployStagedQueriesToDashboard(activeDashboardId, stagedQueries).fold(
                                onSuccess = {
                                    AppContainer.queryCartRepository.clearCart()
                                    onQueriesDeployed()
                                    onDismiss()
                                },
                                onFailure = { e ->
                                    deployError = e.messageOrDefault(UiErrorKey.CART_DEPLOY_FAILED)
                                }
                            )
                            isDeploying = false
                        }
                    },
                    enabled = !isDeploying,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    DeployCartButtonContent(
                        isDeploying = isDeploying,
                        stagedCount = stagedQueries.size
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}

/**
 * Renders the interior label or progress indicator for the deploy button in [QueryCartSheetContent].
 *
 * @param isDeploying Whether batch deployment is currently in progress.
 * @param stagedCount Number of staged queries.
 */
@Composable
private fun DeployCartButtonContent(
    isDeploying: Boolean,
    stagedCount: Int
) {
    if (isDeploying) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp))
    } else {
        Text(stringResource(Res.string.cart_add_widgets_fmt, stagedCount))
    }
}

/**
 * Card displaying an individual staged query item.
 *
 * @param query Staged query model.
 */
@Composable
private fun StagedQueryCard(
    query: StagedQuery
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = query.title,
                    style = MaterialTheme.typography.titleMedium
                )
                IconButton(
                    onClick = { AppContainer.queryCartRepository.removeQuery(query.id) },
                    modifier = Modifier.size(28.dp)
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = stringResource(Res.string.remove_from_cart),
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(6.dp)
                    )
                    .padding(8.dp)
            ) {
                Text(
                    text = query.sql,
                    fontFamily = FontFamily.Monospace,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}
