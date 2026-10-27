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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    vm.saveSettings(
                        successMessage = saveSuccessMsg,
                        errorPrefix = errorSaveBase
                    )
                },
                icon = { Icon(Icons.Filled.Save, contentDescription = null) },
                text = { Text(stringResource(Res.string.save_settings)) }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier.fillMaxSize().padding(paddingValues),
            contentAlignment = Alignment.Center
        ) {
            if (uiState.isLoading && uiState.apiKeys.isEmpty()) {
                CircularProgressIndicator()
            } else if (uiState.errorMessage != null && uiState.apiKeys.isEmpty()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = uiState.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
                    Button(onClick = { vm.loadSettings(errorPrefix = errorLoadBase) }) {
                        Text(stringResource(Res.string.retry))
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(bottom = 80.dp)
                ) {
                    item {
                        ElevatedCard(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = onNavigateToUserManagement
                        ) {
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
                    }

                    item {
                        Text(
                            text = stringResource(Res.string.api_keys),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    item {
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
                                if (newKey.isNotBlank() && newValue.isNotBlank()) {
                                    vm.putApiKey(newKey, newValue)
                                    newKey = ""
                                    newValue = ""
                                }
                            }) {
                                Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.add_key))
                            }
                        }
                    }

                    items(uiState.apiKeys.entries.toList()) { (key, value) ->
                        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(text = "$key: ${value.take(4)}...", style = MaterialTheme.typography.bodyMedium)
                                IconButton(onClick = { vm.removeApiKey(key) }) {
                                    Icon(
                                        Icons.Filled.Delete,
                                        contentDescription = stringResource(Res.string.delete_key),
                                        tint = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                        }
                    }

                    item { HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp)) }

                    item {
                        Text(
                            text = stringResource(Res.string.visible_models),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }

                    item {
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
                                if (newModel.isNotBlank() && !uiState.visibleModels.contains(newModel)) {
                                    vm.addVisibleModel(newModel)
                                    newModel = ""
                                }
                            }) {
                                Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.add_model))
                            }
                        }
                    }

                    items(uiState.visibleModels) { model ->
                        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(text = model, style = MaterialTheme.typography.bodyMedium)
                                IconButton(onClick = { vm.removeVisibleModel(model) }) {
                                    Icon(
                                        Icons.Filled.Delete,
                                        contentDescription = stringResource(Res.string.delete_model),
                                        tint = MaterialTheme.colorScheme.error
                                    )
                                }
                            }
                        }
                    }

                    if (uiState.isLoading) {
                        item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
                    }
                }
            }
        }
    }
}
