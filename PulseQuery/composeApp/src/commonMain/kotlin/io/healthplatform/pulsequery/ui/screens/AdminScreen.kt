/**
 * Component for rendering the AdminScreen.
 * Provides the main user interface for this screen.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.AdminSettingsUpdateRequest
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Admin Screen for managing platform configurations like API keys and visible LLM models.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen() {
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val apiKeys = remember { mutableStateMapOf<String, String>() }
    val visibleModels = remember { mutableStateListOf<String>() }
    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    fun loadSettings() {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            try {
                val response = AppContainer.adminApi.readAdminSettingsApiV1AdminSettingsGet()
                val settings = response.body()
                
                apiKeys.clear()
                settings.apiKeys.forEach { (k, v) -> apiKeys[k] = v }
                
                visibleModels.clear()
                visibleModels.addAll(settings.visibleModels)
            } catch (e: Exception) {
                errorMessage = "Failed to load admin settings: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadSettings()
    }

    fun saveSettings() {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            try {
                val updateReq = AdminSettingsUpdateRequest(
                    apiKeys = apiKeys.toMap(),
                    visibleModels = visibleModels.toList()
                )
                AppContainer.adminApi.writeAdminSettingsApiV1AdminSettingsPut(updateReq)
                snackbarHostState.showSnackbar("Settings saved successfully")
            } catch (e: Exception) {
                errorMessage = "Failed to save admin settings: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Admin Settings") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                )
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { saveSettings() },
                icon = { Icon(Icons.Filled.Save, contentDescription = "Save Settings") },
                text = { Text("Save Settings") }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier.fillMaxSize().padding(paddingValues),
            contentAlignment = Alignment.Center
        ) {
            if (isLoading && apiKeys.isEmpty()) {
                CircularProgressIndicator()
            } else if (errorMessage != null && apiKeys.isEmpty()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error)
                    Button(onClick = { loadSettings() }) { Text("Retry") }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(bottom = 80.dp) // space for FAB
                ) {
                    item {
                        Text(
                            text = "API Keys",
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
                                label = { Text("Provider") },
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = newValue,
                                onValueChange = { newValue = it },
                                label = { Text("Key") },
                                modifier = Modifier.weight(2f)
                            )
                            IconButton(onClick = {
                                if (newKey.isNotBlank() && newValue.isNotBlank()) {
                                    apiKeys[newKey] = newValue
                                    newKey = ""
                                    newValue = ""
                                }
                            }) {
                                Icon(Icons.Filled.Add, contentDescription = "Add Key")
                            }
                        }
                    }

                    items(apiKeys.entries.toList()) { (key, value) ->
                        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(text = "$key: ${value.take(4)}...", style = MaterialTheme.typography.bodyMedium)
                                IconButton(onClick = { apiKeys.remove(key) }) {
                                    Icon(Icons.Filled.Delete, contentDescription = "Delete Key", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }

                    item { HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp)) }

                    item {
                        Text(
                            text = "Visible Models",
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
                                label = { Text("Model Name") },
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = {
                                if (newModel.isNotBlank() && !visibleModels.contains(newModel)) {
                                    visibleModels.add(newModel)
                                    newModel = ""
                                }
                            }) {
                                Icon(Icons.Filled.Add, contentDescription = "Add Model")
                            }
                        }
                    }

                    items(visibleModels.toList()) { model ->
                        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(text = model, style = MaterialTheme.typography.bodyMedium)
                                IconButton(onClick = { visibleModels.remove(model) }) {
                                    Icon(Icons.Filled.Delete, contentDescription = "Delete Model", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                    
                    if (isLoading) {
                        item { LinearProgressIndicator(modifier = Modifier.fillMaxWidth()) }
                    }
                }
            }
        }
    }
}
