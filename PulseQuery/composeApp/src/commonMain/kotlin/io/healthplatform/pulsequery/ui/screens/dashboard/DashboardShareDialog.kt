/**
 * Dashboard Sharing Dialog module for managing collaborator permissions.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardShareCreate
import io.healthplatform.pulsequery.api.models.DashboardShareResponse
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * State representation for the Dashboard Sharing Dialog.
 *
 * @property isLoading Indicates whether a network operation is in progress.
 * @property errorMessage Error text to display upon failure.
 * @property shares Current list of active dashboard shares.
 * @property inviteEmail Input field value for inviting a user.
 * @property invitePermission Selected permission level for invitation (VIEW or EDIT).
 */
data class DashboardShareDialogState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val shares: List<DashboardShareResponse> = emptyList(),
    val inviteEmail: String = "",
    val invitePermission: String = "VIEW"
)

/**
 * Modal dialog for sharing a dashboard with collaborators and modifying access levels.
 *
 * @param dashboardId Identifier of the dashboard being shared.
 * @param onDismiss Request to close the dialog.
 * @param modifier Optional layout modifier.
 */
@Composable
fun DashboardShareDialog(
    dashboardId: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Share Dashboard") },
        text = {
            DashboardShareContent(
                dashboardId = dashboardId,
                onDismiss = onDismiss,
                modifier = modifier
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Done")
            }
        }
    )
}

/**
 * Interactive content for managing dashboard collaborator shares.
 *
 * @param dashboardId Identifier of the dashboard being shared.
 * @param onDismiss Callback invoked to close or dismiss sharing.
 * @param modifier Optional layout modifier.
 */
@Composable
fun DashboardShareContent(
    dashboardId: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    var state by remember { mutableStateOf(DashboardShareDialogState(isLoading = true)) }
    val coroutineScope = rememberCoroutineScope()

    /**
     * Loads the existing shares for this dashboard.
     */
    fun loadShares() {
        coroutineScope.launch {
            state = state.copy(isLoading = true, errorMessage = null)
            runCatching {
                AppContainer.dashboardsApi
                    .listDashboardSharesApiV1DashboardsDashboardIdSharesGet(dashboardId)
                    .body()
            }.fold(
                onSuccess = { shares ->
                    state = state.copy(isLoading = false, shares = shares)
                },
                onFailure = { e ->
                    state = state.copy(isLoading = false, errorMessage = e.message ?: "Failed to load shares")
                }
            )
        }
    }

    /**
     * Invites a collaborator by email.
     */
    fun inviteUser() {
        if (state.inviteEmail.isBlank()) return
        coroutineScope.launch {
            state = state.copy(isLoading = true, errorMessage = null)
            runCatching {
                val req = DashboardShareCreate(
                    userEmail = state.inviteEmail.trim(),
                    permissionLevel = state.invitePermission
                )
                AppContainer.dashboardsApi
                    .shareDashboardApiV1DashboardsDashboardIdSharesPost(dashboardId, req)
            }.fold(
                onSuccess = {
                    state = state.copy(inviteEmail = "")
                    loadShares()
                },
                onFailure = { e ->
                    state = state.copy(isLoading = false, errorMessage = e.message ?: "Failed to share dashboard")
                }
            )
        }
    }

    /**
     * Revokes access for an existing share.
     *
     * @param shareId Identifier of the share to delete.
     */
    fun revokeShare(shareId: String) {
        coroutineScope.launch {
            state = state.copy(isLoading = true, errorMessage = null)
            runCatching {
                AppContainer.dashboardsApi
                    .deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete(dashboardId, shareId)
            }.fold(
                onSuccess = {
                    loadShares()
                },
                onFailure = { e ->
                    state = state.copy(isLoading = false, errorMessage = e.message ?: "Failed to revoke share")
                }
            )
        }
    }

    LaunchedEffect(dashboardId) {
        loadShares()
    }

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = state.inviteEmail,
            onValueChange = { state = state.copy(inviteEmail = it) },
            label = { Text("Collaborator Email") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = state.invitePermission == "VIEW",
                    onClick = { state = state.copy(invitePermission = "VIEW") },
                    label = { Text("View") }
                )
                FilterChip(
                    selected = state.invitePermission == "EDIT",
                    onClick = { state = state.copy(invitePermission = "EDIT") },
                    label = { Text("Edit") }
                )
            }

            Button(
                onClick = { inviteUser() },
                enabled = !state.isLoading && state.inviteEmail.isNotBlank()
            ) {
                Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Invite")
            }
        }

        if (state.errorMessage != null) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = state.errorMessage ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall
            )
        }

        Spacer(modifier = Modifier.height(16.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = "Collaborators (${state.shares.size})",
            style = MaterialTheme.typography.titleSmall
        )
        Spacer(modifier = Modifier.height(8.dp))

        if (state.isLoading && state.shares.isEmpty()) {
            Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            }
        } else if (state.shares.isEmpty()) {
            Text(
                text = "No collaborators shared yet.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(state.shares) { share ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = share.userEmail,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                text = "Permission: ${share.permissionLevel}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.secondary
                            )
                        }
                        IconButton(onClick = { revokeShare(share.id) }) {
                            Icon(
                                Icons.Filled.Delete,
                                contentDescription = "Revoke access for ${share.userEmail}",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onDismiss) {
                Text("Done")
            }
        }
    }
}
