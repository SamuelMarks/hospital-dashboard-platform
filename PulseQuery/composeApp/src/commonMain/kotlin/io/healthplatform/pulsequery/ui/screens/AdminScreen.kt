package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.AdminSettingsResponse
import io.healthplatform.pulsequery.api.models.AdminSettingsUpdateRequest
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Admin Screen for managing platform configurations like API keys and visible LLM models.
 * Maps to /api/v1/admin/settings
 *
 * @param onNavigateBack Callback to return to the previous screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(onNavigateBack: () -> Unit) {
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    // Mutable copies of the admin settings
    val apiKeys = remember { mutableStateMapOf<String, String>() }
    val visibleModels = remember { mutableStateListOf<String>() }

    val coroutineScope = rememberCoroutineScope()

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
                // Optionally show a success snackbar or toast here
            } catch (e: Exception) {
                errorMessage = "Failed to save admin settings: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Settings") },
                navigationIcon = {
                    TextButton(onClick = onNavigateBack) {
                        Text("< Back", color = MaterialTheme.colorScheme.onPrimary)
                    }
                },
                actions = {
                    TextButton(onClick = { saveSettings() }, enabled = !isLoading) {
                        Text("Save", color = MaterialTheme.colorScheme.onPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier.fillMaxSize().padding(paddingValues),
            contentAlignment = Alignment.Center
        ) {
            when {
                isLoading && apiKeys.isEmpty() -> CircularProgressIndicator()
                errorMessage != null && apiKeys.isEmpty() -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error)
                        Button(onClick = { loadSettings() }) { Text("Retry") }
                    }
                }
                else -> {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        Text(
                            text = "API Keys",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.primary
                        )
                        
                        // We will allow adding new keys simply with two text fields
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
                                label = { Text("Provider (e.g. OPENAI)") },
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = newValue,
                                onValueChange = { newValue = it },
                                label = { Text("API Key") },
                                modifier = Modifier.weight(2f)
                            )
                            Button(onClick = {
                                if (newKey.isNotBlank() && newValue.isNotBlank()) {
                                    apiKeys[newKey] = newValue
                                    newKey = ""
                                    newValue = ""
                                }
                            }) {
                                Text("Add")
                            }
                        }

                        // List existing API keys
                        LazyColumn(
                            modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(apiKeys.entries.toList()) { (key, value) ->
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(text = "$key: ${value.take(4)}...", style = MaterialTheme.typography.bodyMedium)
                                        TextButton(onClick = { apiKeys.remove(key) }) {
                                            Text("Remove", color = MaterialTheme.colorScheme.error)
                                        }
                                    }
                                }
                            }
                        }

                        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                        Text(
                            text = "Visible Models",
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.primary
                        )

                        var newModel by remember { mutableStateOf("") }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = newModel,
                                onValueChange = { newModel = it },
                                label = { Text("Model Name (e.g. gpt-4o)") },
                                modifier = Modifier.weight(1f)
                            )
                            Button(onClick = {
                                if (newModel.isNotBlank() && !visibleModels.contains(newModel)) {
                                    visibleModels.add(newModel)
                                    newModel = ""
                                }
                            }) {
                                Text("Add")
                            }
                        }

                        // List existing models
                        LazyColumn(
                            modifier = Modifier.fillMaxWidth().weight(1f),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(visibleModels.toList()) { model ->
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Row(
                                        modifier = Modifier.padding(8.dp).fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(text = model, style = MaterialTheme.typography.bodyMedium)
                                        TextButton(onClick = { visibleModels.remove(model) }) {
                                            Text("Remove", color = MaterialTheme.colorScheme.error)
                                        }
                                    }
                                }
                            }
                        }
                        
                        if (isLoading) {
                            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }
        }
    }
}
