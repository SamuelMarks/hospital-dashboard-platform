package io.healthplatform.pulsequery.ui.components.cart

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.StagedQuery
import kotlinx.coroutines.launch

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
    val stagedQueries by AppContainer.queryCartRepository.stagedQueries.collectAsState()
    val scope = rememberCoroutineScope()
    var isDeploying by remember { mutableStateOf(false) }
    var deployError by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss
    ) {
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
                    text = "Query Cart (${stagedQueries.size})",
                    style = MaterialTheme.typography.titleLarge
                )

                if (stagedQueries.isNotEmpty()) {
                    TextButton(onClick = { AppContainer.queryCartRepository.clearCart() }) {
                        Text("Clear All")
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (deployError != null) {
                Text(
                    text = deployError ?: "",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
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
                        text = "Your query cart is empty. Stage queries from SQL Editor or Chat.",
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
                    items(stagedQueries, key = { it.id }) { query ->
                        StagedQueryCard(
                            query = query,
                            onRemove = { AppContainer.queryCartRepository.removeQuery(query.id) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (!activeDashboardId.isNullOrBlank()) {
                    Button(
                        onClick = {
                            scope.launch {
                                isDeploying = true
                                deployError = null
                                runCatching {
                                    for (query in stagedQueries) {
                                        val widgetIn = WidgetIn.Sql(
                                            title = query.title,
                                            visualization = query.visualization,
                                            config = SqlConfig(query = query.sql)
                                        )
                                        AppContainer.dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(
                                            activeDashboardId,
                                            widgetIn
                                        )
                                    }
                                }.fold(
                                    onSuccess = {
                                        AppContainer.queryCartRepository.clearCart()
                                        onQueriesDeployed()
                                        onDismiss()
                                    },
                                    onFailure = { e ->
                                        deployError = e.message ?: "Failed to deploy queries to dashboard"
                                    }
                                )
                                isDeploying = false
                            }
                        },
                        enabled = !isDeploying,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (isDeploying) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp))
                        } else {
                            Text("Add ${stagedQueries.size} Widgets to Dashboard")
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

/**
 * Card displaying an individual staged query item.
 *
 * @param query Staged query model.
 * @param onRemove Callback to delete query from cart.
 */
@Composable
private fun StagedQueryCard(
    query: StagedQuery,
    onRemove: () -> Unit
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
                IconButton(onClick = onRemove, modifier = Modifier.size(28.dp)) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Remove from cart",
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
