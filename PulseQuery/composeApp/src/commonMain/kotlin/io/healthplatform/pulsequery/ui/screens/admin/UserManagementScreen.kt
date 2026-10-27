/**
 * Administrative User Management Screen module providing user search, clinical role assignment,
 * and account status toggling.
 */
package io.healthplatform.pulsequery.ui.screens.admin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.UserResponse
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.all_roles
import pulsequery.composeapp.generated.resources.change_role
import pulsequery.composeapp.generated.resources.navigate_back
import pulsequery.composeapp.generated.resources.no_users_found
import pulsequery.composeapp.generated.resources.retry
import pulsequery.composeapp.generated.resources.search
import pulsequery.composeapp.generated.resources.search_users_by_email
import pulsequery.composeapp.generated.resources.user_active
import pulsequery.composeapp.generated.resources.user_id_label
import pulsequery.composeapp.generated.resources.user_management
import pulsequery.composeapp.generated.resources.user_role_label
import pulsequery.composeapp.generated.resources.user_suspended

/**
 * Screen composable facilitating administrative user management in Compose Multiplatform.
 *
 * Provides live search, clinical role filtering, role modifications, and account status toggling.
 *
 * @param viewModel ViewModel managing user state and administrative API calls.
 * @param onNavigateBack Callback executed when user navigates back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UserManagementScreen(
    viewModel: UserManagementViewModel? = null,
    onNavigateBack: () -> Unit = {}
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = viewModel ?: remember(coroutineScope) {
        UserManagementViewModel(scope = coroutineScope)
    }
    val state by vm.state.collectAsState()

    LaunchedEffect(vm) {
        vm.loadUsers()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(Res.string.user_management),
                        modifier = Modifier.semantics { heading() }
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(Res.string.navigate_back)
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (val currentState = state) {
                is UserManagementUiState.Loading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                is UserManagementUiState.Error -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp)
                            .semantics { liveRegion = LiveRegionMode.Assertive },
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = currentState.message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { vm.loadUsers() }) {
                            Text(stringResource(Res.string.retry))
                        }
                    }
                }
                is UserManagementUiState.Success -> {
                    UserListContent(
                        state = currentState,
                        onSearchChange = { vm.setSearchQuery(it) },
                        onRoleFilterSelect = { vm.setRoleFilter(it) },
                        onRoleChange = { id, role -> vm.updateRole(id, role) },
                        onStatusToggle = { id, status -> vm.toggleStatus(id, status) }
                    )
                }
            }
        }
    }
}

/**
 * Renders the search header, role filter chips, and user account cards.
 *
 * @param state Active success state containing filtered user profiles.
 * @param onSearchChange Callback when search query text changes.
 * @param onRoleFilterSelect Callback when role filter chip is clicked.
 * @param onRoleChange Callback when new role is chosen for a user.
 * @param onStatusToggle Callback when active status toggle is switched.
 */
@Composable
private fun UserListContent(
    state: UserManagementUiState.Success,
    onSearchChange: (String) -> Unit,
    onRoleFilterSelect: (String?) -> Unit,
    onRoleChange: (String, String) -> Unit,
    onStatusToggle: (String, Boolean) -> Unit
) {
    val roles = listOf("ADMIN", "PHYSICIAN", "CHARGE_NURSE", "ANALYST")

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(
            value = state.searchQuery,
            onValueChange = onSearchChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(stringResource(Res.string.search_users_by_email)) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = stringResource(Res.string.search)) },
            singleLine = true
        )

        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            item {
                FilterChip(
                    selected = state.selectedRole == null,
                    onClick = { onRoleFilterSelect(null) },
                    label = { Text(stringResource(Res.string.all_roles)) }
                )
            }
            items(roles) { role ->
                FilterChip(
                    selected = state.selectedRole == role,
                    onClick = { onRoleFilterSelect(if (state.selectedRole == role) null else role) },
                    label = { Text(role) }
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (state.users.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = stringResource(Res.string.no_users_found),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(state.users, key = { it.id }) { user ->
                    UserCard(
                        user = user,
                        availableRoles = roles,
                        onRoleChange = { newRole -> onRoleChange(user.id, newRole) },
                        onStatusToggle = { newStatus -> onStatusToggle(user.id, newStatus) }
                    )
                }
            }
        }
    }
}

/**
 * Card displaying individual user credentials, role selector, and active status toggle.
 *
 * @param user User profile entity.
 * @param availableRoles Available selectable clinical roles.
 * @param onRoleChange Callback when new role is selected.
 * @param onStatusToggle Callback when status switch is toggled.
 */
@Composable
private fun UserCard(
    user: UserResponse,
    availableRoles: List<String>,
    onRoleChange: (String) -> Unit,
    onStatusToggle: (Boolean) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    ElevatedCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = user.email,
                        style = MaterialTheme.typography.titleMedium
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = stringResource(Res.string.user_id_label, user.id),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = if (user.isActive) {
                            stringResource(Res.string.user_active)
                        } else {
                            stringResource(Res.string.user_suspended)
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = if (user.isActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Switch(
                        checked = user.isActive,
                        onCheckedChange = onStatusToggle
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(Res.string.user_role_label, user.role ?: ""),
                    style = MaterialTheme.typography.labelLarge
                )

                Box {
                    OutlinedButton(onClick = { expanded = true }) {
                        Text(stringResource(Res.string.change_role))
                    }

                    DropdownMenu(
                        expanded = expanded,
                        onDismissRequest = { expanded = false }
                    ) {
                        availableRoles.forEach { role ->
                            DropdownMenuItem(
                                text = { Text(role) },
                                onClick = {
                                    expanded = false
                                    onRoleChange(role)
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}
