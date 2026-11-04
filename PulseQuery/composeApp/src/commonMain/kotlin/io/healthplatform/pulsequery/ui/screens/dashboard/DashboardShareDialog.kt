/**
 * Dashboard Sharing Dialog module for managing collaborator permissions.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.models.DashboardShareCreate
import io.healthplatform.pulsequery.api.models.DashboardShareResponse
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runResultPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.done
import pulsequery.composeapp.generated.resources.share_collaborator_email
import pulsequery.composeapp.generated.resources.share_collaborators_count_fmt
import pulsequery.composeapp.generated.resources.share_dashboard
import pulsequery.composeapp.generated.resources.share_invite_button
import pulsequery.composeapp.generated.resources.share_no_collaborators
import pulsequery.composeapp.generated.resources.share_permission_edit
import pulsequery.composeapp.generated.resources.share_permission_fmt
import pulsequery.composeapp.generated.resources.share_permission_view
import pulsequery.composeapp.generated.resources.share_revoke_access_fmt

/**
 * UI State holder for [DashboardShareDialog].
 *
 * @property shares Current list of collaborators with access to the dashboard.
 * @property isLoading Whether collaborator list is currently loading.
 * @property isInviting Whether an invite request is currently in flight.
 * @property error Optional error message to display.
 * @property inviteEmail Email input for inviting a new collaborator.
 * @property selectedPermission Selected permission level (`VIEW` or `EDIT`).
 */
data class DashboardShareState(
    val shares: List<DashboardShareResponse> = emptyList(),
    val isLoading: Boolean = true,
    val isInviting: Boolean = false,
    val error: String? = null,
    val inviteEmail: String = "",
    val selectedPermission: String = "VIEW"
)

/**
 * ViewModel managing collaborator listing, invitation, and revocation for [DashboardShareDialog].
 *
 * @property dashboardId Target dashboard UUID.
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property dashboardsApi Optional explicit [DashboardsApi] client override.
 */
class DashboardShareViewModel(
    private val dashboardId: String,
    private val scope: CoroutineScope,
    private val dashboardsApi: DashboardsApi? = null
) {
    private val currentDashboardsApi: DashboardsApi
        get() = dashboardsApi ?: AppContainer.dashboardsApi

    private val _state = MutableStateFlow(DashboardShareState())

    /** Reactive [StateFlow] of the current [DashboardShareState]. */
    val state: StateFlow<DashboardShareState> = _state.asStateFlow()

    /**
     * Updates the collaborator email input field.
     *
     * @param email New email string.
     */
    fun updateInviteEmail(email: String) {
        _state.update { it.copy(inviteEmail = email) }
    }

    /**
     * Updates the selected permission level for new collaborator invitations.
     *
     * @param permission Selected permission string (`"VIEW"` or `"EDIT"`).
     */
    fun updatePermission(permission: String) {
        _state.update { it.copy(selectedPermission = permission) }
    }

    /**
     * Loads the current list of collaborators for [dashboardId] on [scope].
     */
    fun loadShares() {
        scope.launch {
            performLoadShares()
        }
    }

    /**
     * Executes the suspending retrieval of collaborators for [dashboardId].
     */
    suspend fun performLoadShares() {
        _state.update { it.copy(isLoading = true, error = null) }
        runResultPulseAsync {
            currentDashboardsApi.listDashboardSharesApiV1DashboardsDashboardIdSharesGet(dashboardId).asResult()
        }.fold(
            onSuccess = { list ->
                _state.update { it.copy(shares = list, isLoading = false, error = null) }
            },
            onFailure = { e ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        error = e.messageOrDefault(UiErrorKey.LOAD_COLLABORATORS)
                    )
                }
            }
        )
    }

    /**
     * Invites the collaborator specified by [DashboardShareState.inviteEmail] and reloads shares on success.
     */
    fun inviteUser() {
        val current = _state.value
        val trimmedEmail = current.inviteEmail.trim()
        if (trimmedEmail.isBlank()) return

        scope.launch {
            _state.update { it.copy(isInviting = true, error = null) }
            runResultPulseAsync {
                val createReq = DashboardShareCreate(
                    userEmail = trimmedEmail,
                    permissionLevel = current.selectedPermission
                )
                currentDashboardsApi.shareDashboardApiV1DashboardsDashboardIdSharesPost(
                    dashboardId,
                    createReq
                ).asResult()
            }.fold(
                onSuccess = {
                    _state.update { it.copy(inviteEmail = "", isInviting = false, error = null) }
                    performLoadShares()
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isInviting = false,
                            error = e.messageOrDefault(UiErrorKey.INVITE_COLLABORATOR)
                        )
                    }
                }
            )
        }
    }

    /**
     * Revokes an existing collaborator share by [shareId] and reloads shares on success.
     *
     * @param shareId Share record UUID to revoke.
     */
    fun revokeShare(shareId: String) {
        scope.launch {
            runResultPulseAsync {
                currentDashboardsApi.deleteDashboardShareApiV1DashboardsDashboardIdSharesShareIdDelete(
                    dashboardId,
                    shareId
                ).asResult()
            }.fold(
                onSuccess = { performLoadShares() },
                onFailure = { e ->
                    _state.update {
                        it.copy(error = e.messageOrDefault(UiErrorKey.REVOKE_COLLABORATOR))
                    }
                }
            )
        }
    }
}

/**
 * Resolves the active [DashboardShareViewModel], returning [viewModel] when provided or creating a scoped instance.
 *
 * @param dashboardId Target dashboard UUID.
 * @param viewModel Optional caller-supplied [DashboardShareViewModel].
 * @param scope CoroutineScope used when constructing a default [DashboardShareViewModel].
 * @return Active [DashboardShareViewModel] instance.
 */
internal fun resolveDashboardShareViewModel(
    dashboardId: String,
    viewModel: DashboardShareViewModel?,
    scope: CoroutineScope
): DashboardShareViewModel = viewModel ?: DashboardShareViewModel(dashboardId = dashboardId, scope = scope)

/**
 * Dialog allowing dashboard owners to list collaborators, invite users by email
 * with `VIEW` or `EDIT` permissions, and revoke existing access.
 *
 * @param dashboardId ID of the dashboard being shared.
 * @param onDismiss Callback invoked when the dialog is closed.
 * @param viewModel Optional [DashboardShareViewModel] override for testing.
 */
@Composable
fun DashboardShareDialog(
    dashboardId: String,
    onDismiss: () -> Unit,
    viewModel: DashboardShareViewModel? = null
) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            DashboardShareContent(
                dashboardId = dashboardId,
                onDismiss = onDismiss,
                viewModel = viewModel
            )
        }
    }
}

/**
 * Inner content composable for [DashboardShareDialog], exposed for direct Compose UI testing.
 *
 * @param dashboardId ID of the dashboard being shared.
 * @param onDismiss Callback invoked when the dialog is closed.
 * @param viewModel Optional [DashboardShareViewModel] override for testing.
 */
@Composable
fun DashboardShareContent(
    dashboardId: String,
    onDismiss: () -> Unit,
    viewModel: DashboardShareViewModel? = null
) {
    val scope = rememberCoroutineScope()
    val resolvedViewModel = remember(dashboardId, viewModel) {
        resolveDashboardShareViewModel(dashboardId, viewModel, scope)
    }
    val state by resolvedViewModel.state.collectAsState()

    LaunchedEffect(resolvedViewModel) {
        resolvedViewModel.performLoadShares()
    }

    DashboardShareBody(
        state = state,
        onEmailChange = { resolvedViewModel.updateInviteEmail(it) },
        onPermissionChange = { resolvedViewModel.updatePermission(it) },
        onInvite = { resolvedViewModel.inviteUser() },
        onRevoke = { resolvedViewModel.revokeShare(it) },
        onDismiss = onDismiss
    )
}

/**
 * Stateless UI body for [DashboardShareDialog].
 *
 * @param state Current [DashboardShareState].
 * @param onEmailChange Callback when email input changes.
 * @param onPermissionChange Callback when permission chip is selected.
 * @param onInvite Callback when Invite button is clicked.
 * @param onRevoke Callback when a collaborator's revoke button is clicked.
 * @param onDismiss Callback when Done button is clicked.
 */
@Composable
fun DashboardShareBody(
    state: DashboardShareState,
    onEmailChange: (String) -> Unit,
    onPermissionChange: (String) -> Unit,
    onInvite: () -> Unit,
    onRevoke: (String) -> Unit,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Share,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
            Text(
                text = stringResource(Res.string.share_dashboard),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = state.inviteEmail,
            onValueChange = onEmailChange,
            label = { Text(stringResource(Res.string.share_collaborator_email)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = state.selectedPermission == "VIEW",
                    onClick = { onPermissionChange("VIEW") },
                    label = { Text(stringResource(Res.string.share_permission_view)) }
                )
                FilterChip(
                    selected = state.selectedPermission == "EDIT",
                    onClick = { onPermissionChange("EDIT") },
                    label = { Text(stringResource(Res.string.share_permission_edit)) }
                )
            }

            Button(
                onClick = onInvite,
                enabled = state.inviteEmail.isNotBlank() && !state.isInviting
            ) {
                ShareInviteButtonContent(isInviting = state.isInviting)
            }
        }

        state.error?.let { err ->
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = err,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = stringResource(Res.string.share_collaborators_count_fmt, state.shares.size),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )

        Spacer(modifier = Modifier.height(8.dp))

        if (state.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(100.dp),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else if (state.shares.isEmpty()) {
            Text(
                text = stringResource(Res.string.share_no_collaborators),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 120.dp)
            ) {
                items(state.shares, key = { it.id }) { share ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = share.userEmail,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium
                                )
                                Text(
                                    text = stringResource(Res.string.share_permission_fmt, share.permissionLevel),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { onRevoke(share.id) }) {
                                Icon(
                                    imageVector = Icons.Default.Delete,
                                    contentDescription = stringResource(
                                        Res.string.share_revoke_access_fmt,
                                        share.userEmail
                                    ),
                                    tint = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onDismiss) {
                Text(stringResource(Res.string.done))
            }
        }
    }
}

/**
 * Renders the interior progress indicator and label for the Invite button in [DashboardShareBody].
 *
 * @param isInviting Whether a collaborator invitation request is currently in progress.
 */
@Composable
internal fun ShareInviteButtonContent(isInviting: Boolean) {
    if (isInviting) {
        CircularProgressIndicator(
            modifier = Modifier.size(16.dp),
            strokeWidth = 2.dp
        )
        Spacer(modifier = Modifier.width(8.dp))
    }
    Text(stringResource(Res.string.share_invite_button))
}
