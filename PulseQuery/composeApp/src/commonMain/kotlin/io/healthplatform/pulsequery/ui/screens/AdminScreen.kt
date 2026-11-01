/**
 * Component for rendering the AdminScreen.
 * Provides the main user interface for managing platform configurations,
 * delegating all state and API calls to [AdminViewModel].
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.ui.screens.admin.AdminUiState
import io.healthplatform.pulsequery.ui.screens.admin.AdminViewModel
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.add_key
import pulsequery.composeapp.generated.resources.add_model
import pulsequery.composeapp.generated.resources.admin_settings
import pulsequery.composeapp.generated.resources.api_keys
import pulsequery.composeapp.generated.resources.delete_key
import pulsequery.composeapp.generated.resources.delete_model
import pulsequery.composeapp.generated.resources.failed_to_load_admin_settings
import pulsequery.composeapp.generated.resources.failed_to_save_admin_settings
import pulsequery.composeapp.generated.resources.key
import pulsequery.composeapp.generated.resources.model_name
import pulsequery.composeapp.generated.resources.provider
import pulsequery.composeapp.generated.resources.retry
import pulsequery.composeapp.generated.resources.save_settings
import pulsequery.composeapp.generated.resources.settings_saved_successfully
import pulsequery.composeapp.generated.resources.staff_user_management
import pulsequery.composeapp.generated.resources.staff_user_management_desc
import pulsequery.composeapp.generated.resources.users_action
import pulsequery.composeapp.generated.resources.visible_models

/**
 * Checks whether a new API key entry has both a non-blank provider name and key secret.
 *
 * @param provider Provider identifier string.
 * @param keyValue Secret API key value.
 * @return True if both fields are non-blank.
 */
internal fun canAddApiKey(provider: String, keyValue: String): Boolean {
    return provider.isNotBlank() && keyValue.isNotBlank()
}

/**
 * Checks whether a candidate model identifier can be added to the visible models list.
 *
 * @param modelName Candidate model name.
 * @param existingModels Currently configured visible models.
 * @return True if [modelName] is non-blank and not already present.
 */
internal fun canAddVisibleModel(modelName: String, existingModels: List<String>): Boolean {
    return modelName.isNotBlank() && !existingModels.contains(modelName)
}

/**
 * Formats an API key entry with a masked secret preview for display.
 *
 * @param provider Provider name.
 * @param keyValue Raw or masked API key value.
 * @return Masked preview string (`"provider: xxxx..."`).
 */
internal fun formatApiKeyPreview(provider: String, keyValue: String): String {
    return "$provider: ${keyValue.take(4)}..."
}

/**
 * Admin Screen for managing platform configurations like API keys, visible LLM models,
 * and navigating to hospital user role management.
 *
 * @param onNavigateToUserManagement Callback navigating to user management screen.
 * @param viewModel Optional [AdminViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    onNavigateToUserManagement: () -> Unit = {},
    viewModel: AdminViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, coroutineScope) {
        viewModel ?: AdminViewModel(scope = coroutineScope)
    }

    val uiState by vm.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    val errorLoadBase = stringResource(Res.string.failed_to_load_admin_settings, "")
    val errorSaveBase = stringResource(Res.string.failed_to_save_admin_settings, "")
    val saveSuccessMsg = stringResource(Res.string.settings_saved_successfully)

    LaunchedEffect(vm) {
        vm.loadSettings(errorPrefix = errorLoadBase)
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            AdminScreenTopBar(onNavigateToUserManagement = onNavigateToUserManagement)
        },
        floatingActionButton = {
            AdminScreenFab(
                onSave = {
                    vm.saveSettings(
                        successMessage = saveSuccessMsg,
                        errorPrefix = errorSaveBase
                    )
                }
            )
        }
    ) { paddingValues ->
        AdminScreenBody(
            uiState = uiState,
            paddingValues = paddingValues,
            onNavigateToUserManagement = onNavigateToUserManagement,
            onRetryLoad = { vm.loadSettings(errorPrefix = errorLoadBase) },
            onAddApiKey = { k, v -> vm.putApiKey(k, v) },
            onRemoveApiKey = { k -> vm.removeApiKey(k) },
            onAddModel = { m -> vm.addVisibleModel(m) },
            onRemoveModel = { m -> vm.removeVisibleModel(m) }
        )
    }
}

/**
 * Renders the top app bar for [AdminScreen].
 *
 * @param onNavigateToUserManagement Callback invoked when the Users action button is clicked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AdminScreenTopBar(onNavigateToUserManagement: () -> Unit) {
    TopAppBar(
        title = { Text(stringResource(Res.string.admin_settings)) },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface
        ),
        actions = {
            TextButton(onClick = onNavigateToUserManagement) {
                Icon(Icons.Filled.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(stringResource(Res.string.users_action))
            }
        }
    )
}

/**
 * Renders the Save Settings floating action button for [AdminScreen].
 *
 * @param onSave Callback invoked when the FAB is clicked.
 */
@Composable
private fun AdminScreenFab(onSave: () -> Unit) {
    ExtendedFloatingActionButton(
        onClick = onSave,
        icon = { Icon(Icons.Filled.Save, contentDescription = null) },
        text = { Text(stringResource(Res.string.save_settings)) }
    )
}

/**
 * Renders the main content area of [AdminScreen].
 *
 * @param uiState Current [AdminUiState].
 * @param paddingValues Scaffold inner padding.
 * @param onNavigateToUserManagement Callback navigating to user management screen.
 * @param onRetryLoad Callback invoked when retrying failed initial load.
 * @param onAddApiKey Callback invoked to add a provider API key.
 * @param onRemoveApiKey Callback invoked to remove a provider API key.
 * @param onAddModel Callback invoked to add a visible model.
 * @param onRemoveModel Callback invoked to remove a visible model.
 */
@Composable
private fun AdminScreenBody(
    uiState: AdminUiState,
    paddingValues: PaddingValues,
    onNavigateToUserManagement: () -> Unit,
    onRetryLoad: () -> Unit,
    onAddApiKey: (String, String) -> Unit,
    onRemoveApiKey: (String) -> Unit,
    onAddModel: (String) -> Unit,
    onRemoveModel: (String) -> Unit
) {
    Box(
        modifier = Modifier.fillMaxSize().padding(paddingValues),
        contentAlignment = Alignment.Center
    ) {
        if (uiState.isLoading && uiState.apiKeys.isEmpty()) {
            CircularProgressIndicator()
        } else if (uiState.errorMessage != null && uiState.apiKeys.isEmpty()) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(text = uiState.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
                Button(onClick = onRetryLoad) {
                    Text(stringResource(Res.string.retry))
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
                    .padding(bottom = 80.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                AdminStaffManagementCard(onClick = onNavigateToUserManagement)

                Text(
                    text = stringResource(Res.string.api_keys),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary
                )

                AdminAddApiKeyRow(onAddApiKey = onAddApiKey)

                uiState.apiKeys.entries.forEach { (key, value) ->
                    AdminApiKeyCard(
                        provider = key,
                        keyValue = value,
                        onDelete = { onRemoveApiKey(key) }
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                Text(
                    text = stringResource(Res.string.visible_models),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary
                )

                AdminAddModelRow(
                    existingModels = uiState.visibleModels,
                    onAddModel = onAddModel
                )

                uiState.visibleModels.forEach { model ->
                    AdminVisibleModelCard(
                        model = model,
                        onDelete = { onRemoveModel(model) }
                    )
                }

                if (uiState.isLoading) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
            }
        }
    }
}

/**
 * Renders the navigation card linking to Staff & User Management.
 *
 * @param onClick Callback invoked when the card is clicked.
 */
@Composable
private fun AdminStaffManagementCard(onClick: () -> Unit) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick
    ) {
        AdminStaffManagementCardBody()
    }
}

/**
 * Renders the interior row of [AdminStaffManagementCard].
 */
@Composable
private fun AdminStaffManagementCardBody() {
    Row(
        modifier = Modifier.padding(16.dp).fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(Res.string.staff_user_management),
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = stringResource(Res.string.staff_user_management_desc),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Icon(Icons.Filled.PersonAdd, contentDescription = null)
    }
}

/**
 * Renders the input row for adding a new provider API key.
 *
 * @param onAddApiKey Callback invoked with `(provider, key)` when valid input is submitted.
 */
@Composable
private fun AdminAddApiKeyRow(onAddApiKey: (String, String) -> Unit) {
    var newKey by remember { mutableStateOf("") }
    var newValue by remember { mutableStateOf("") }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = newKey,
            onValueChange = { newKey = it },
            label = { Text(stringResource(Res.string.provider)) },
            modifier = Modifier.weight(1f)
        )
        OutlinedTextField(
            value = newValue,
            onValueChange = { newValue = it },
            label = { Text(stringResource(Res.string.key)) },
            modifier = Modifier.weight(2f)
        )
        IconButton(onClick = {
            if (canAddApiKey(newKey, newValue)) {
                onAddApiKey(newKey, newValue)
                newKey = ""
                newValue = ""
            }
        }) {
            Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.add_key))
        }
    }
}

/**
 * Renders a card displaying an existing provider API key entry and delete action.
 *
 * @param provider Provider name.
 * @param keyValue Masked or raw key string.
 * @param onDelete Callback invoked when the delete icon button is clicked.
 */
@Composable
private fun AdminApiKeyCard(
    provider: String,
    keyValue: String,
    onDelete: () -> Unit
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        AdminApiKeyCardBody(
            provider = provider,
            keyValue = keyValue,
            onDelete = onDelete
        )
    }
}

/**
 * Renders the interior content of [AdminApiKeyCard].
 *
 * @param provider Provider name.
 * @param keyValue Masked or raw key string.
 * @param onDelete Callback invoked when the delete icon button is clicked.
 */
@Composable
private fun AdminApiKeyCardBody(
    provider: String,
    keyValue: String,
    onDelete: () -> Unit
) {
    Row(
        modifier = Modifier.padding(8.dp).fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = formatApiKeyPreview(provider, keyValue),
            style = MaterialTheme.typography.bodyMedium
        )
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Filled.Delete,
                contentDescription = stringResource(Res.string.delete_key),
                tint = MaterialTheme.colorScheme.error
            )
        }
    }
}

/**
 * Renders the input row for adding a new visible LLM model identifier.
 *
 * @param existingModels Currently configured visible models.
 * @param onAddModel Callback invoked with the new model identifier.
 */
@Composable
private fun AdminAddModelRow(
    existingModels: List<String>,
    onAddModel: (String) -> Unit
) {
    var newModel by remember { mutableStateOf("") }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        OutlinedTextField(
            value = newModel,
            onValueChange = { newModel = it },
            label = { Text(stringResource(Res.string.model_name)) },
            modifier = Modifier.weight(1f)
        )
        IconButton(onClick = {
            if (canAddVisibleModel(newModel, existingModels)) {
                onAddModel(newModel)
                newModel = ""
            }
        }) {
            Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.add_model))
        }
    }
}

/**
 * Renders a card displaying a configured visible model and delete action.
 *
 * @param model Model identifier string.
 * @param onDelete Callback invoked when the delete icon button is clicked.
 */
@Composable
private fun AdminVisibleModelCard(
    model: String,
    onDelete: () -> Unit
) {
    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
        AdminVisibleModelCardBody(model = model, onDelete = onDelete)
    }
}

/**
 * Renders the interior row of [AdminVisibleModelCard].
 *
 * @param model Model identifier string.
 * @param onDelete Callback invoked when the delete icon button is clicked.
 */
@Composable
private fun AdminVisibleModelCardBody(
    model: String,
    onDelete: () -> Unit
) {
    Row(
        modifier = Modifier.padding(8.dp).fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text = model, style = MaterialTheme.typography.bodyMedium)
        IconButton(onClick = onDelete) {
            Icon(
                Icons.Filled.Delete,
                contentDescription = stringResource(Res.string.delete_model),
                tint = MaterialTheme.colorScheme.error
            )
        }
    }
}
