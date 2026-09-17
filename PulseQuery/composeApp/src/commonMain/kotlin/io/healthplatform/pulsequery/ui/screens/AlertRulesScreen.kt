/**
 * Component for rendering the AlertRulesScreen in Compose Multiplatform.
 * Provides administrators and clinical analysts with capabilities to review
 * and configure hospital capacity alerting thresholds.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.AlertRuleCreate
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertRuleUpdate
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Screen displaying and managing clinical alert rules for hospital occupancy.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlertRulesScreen() {
    var rules by remember { mutableStateOf<List<AlertRuleResponse>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showCreateDialog by remember { mutableStateOf(false) }
    var ruleToEdit by remember { mutableStateOf<AlertRuleResponse?>(null) }

    val scope = rememberCoroutineScope()

    fun loadRules() {
        scope.launch {
            isLoading = true
            errorMessage = null
            runCatching {
                val response = AppContainer.alertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet()
                response.body()
            }.fold(
                onSuccess = { rules = it },
                onFailure = { errorMessage = it.message ?: "Failed to load alert rules" }
            )
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        loadRules()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Alert Rules") },
                actions = {
                    IconButton(onClick = { loadRules() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh Rules")
                    }
                    IconButton(onClick = { showCreateDialog = true }) {
                        Icon(Icons.Filled.Add, contentDescription = "Add Rule")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.Center
        ) {
            when {
                isLoading -> CircularProgressIndicator()
                errorMessage != null -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { loadRules() }) { Text("Retry") }
                    }
                }
                rules.isEmpty() -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "No alert rules configured",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { showCreateDialog = true }) {
                            Text("Create Rule")
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize().padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        item {
                            Text(
                                "Configured Occupancy Thresholds",
                                style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.semantics { heading() }
                            )
                        }
                        items(rules, key = { it.id }) { rule ->
                            AlertRuleCard(
                                rule = rule,
                                onEdit = { ruleToEdit = rule },
                                onDelete = {
                                    scope.launch {
                                        runCatching {
                                            AppContainer.alertRulesApi.deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete(rule.id)
                                        }.onSuccess {
                                            loadRules()
                                        }.onFailure { e ->
                                            errorMessage = e.message ?: "Failed to delete rule"
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    if (showCreateDialog) {
        CreateAlertRuleDialog(
            onDismiss = { showCreateDialog = false },
            onCreated = {
                showCreateDialog = false
                loadRules()
            }
        )
    }

    ruleToEdit?.let { targetRule ->
        EditAlertRuleDialog(
            rule = targetRule,
            onDismiss = { ruleToEdit = null },
            onUpdated = {
                ruleToEdit = null
                loadRules()
            }
        )
    }
}

/**
 * Card rendering an individual clinical alert rule.
 *
 * @param rule The alert rule data to display.
 * @param onEdit Callback triggered to open the edit dialog for this rule.
 * @param onDelete Callback triggered to remove the alert rule.
 */
@Composable
fun AlertRuleCard(
    rule: AlertRuleResponse,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = rule.unitCategory,
                    style = MaterialTheme.typography.titleMedium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Threshold: ${rule.thresholdPercentage}% • Severity: ${rule.severity?.name ?: "WARNING"}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = (rule.thresholdPercentage / 100.0).toFloat().coerceIn(0f, 1f),
                    modifier = Modifier.fillMaxWidth(0.6f)
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onEdit) {
                    Icon(
                        Icons.Filled.Edit,
                        contentDescription = "Edit Rule",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = "Delete Rule",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}

/**
 * Dialog enabling clinicians to edit an existing capacity alert rule.
 *
 * @param rule The existing alert rule being modified.
 * @param onDismiss Invoked when the user cancels or closes the dialog.
 * @param onUpdated Invoked when the alert rule has been successfully updated on the backend.
 */
@Composable
fun EditAlertRuleDialog(
    rule: AlertRuleResponse,
    onDismiss: () -> Unit,
    onUpdated: () -> Unit
) {
    var unitCategory by remember { mutableStateOf(rule.unitCategory) }
    var thresholdText by remember { mutableStateOf(rule.thresholdPercentage.toString()) }
    var severity by remember { mutableStateOf<AlertSeverity>(rule.severity ?: AlertSeverity.WARNING) }
    var isActive by remember { mutableStateOf(rule.isActive ?: true) }
    var isSaving by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Alert Rule") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = unitCategory,
                    onValueChange = { unitCategory = it },
                    label = { Text("Unit Category") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = thresholdText,
                    onValueChange = { thresholdText = it },
                    label = { Text("Occupancy Threshold (%)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Severity", style = MaterialTheme.typography.bodyMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        FilterChip(
                            selected = severity == AlertSeverity.INFO,
                            onClick = { severity = AlertSeverity.INFO },
                            label = { Text("Info") }
                        )
                        FilterChip(
                            selected = severity == AlertSeverity.WARNING,
                            onClick = { severity = AlertSeverity.WARNING },
                            label = { Text("Warning") }
                        )
                        FilterChip(
                            selected = severity == AlertSeverity.CRITICAL,
                            onClick = { severity = AlertSeverity.CRITICAL },
                            label = { Text("Critical") }
                        )
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Active Evaluation", style = MaterialTheme.typography.bodyMedium)
                    Switch(
                        checked = isActive,
                        onCheckedChange = { isActive = it }
                    )
                }
                if (errorText != null) {
                    Text(errorText!!, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val threshold = thresholdText.toDoubleOrNull()
                    if (unitCategory.isBlank()) {
                        errorText = "Unit category is required"
                        return@Button
                    }
                    if (threshold == null || threshold < 1.0 || threshold > 100.0) {
                        errorText = "Threshold must be between 1 and 100"
                        return@Button
                    }
                    scope.launch {
                        isSaving = true
                        runCatching {
                            AppContainer.alertRulesApi.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut(
                                ruleId = rule.id,
                                alertRuleUpdate = AlertRuleUpdate(
                                    unitCategory = unitCategory.trim(),
                                    thresholdPercentage = threshold,
                                    severity = severity,
                                    isActive = isActive
                                )
                            )
                        }.fold(
                            onSuccess = { onUpdated() },
                            onFailure = { errorText = it.message ?: "Update failed" }
                        )
                        isSaving = false
                    }
                },
                enabled = !isSaving
            ) {
                Text(if (isSaving) "Saving..." else "Save Changes")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text("Cancel")
            }
        }
    )
}

/**
 * Dialog enabling clinicians to create a new capacity alert rule.
 *
 * @param onDismiss Invoked when the user cancels the dialog.
 * @param onCreated Invoked when the new rule is successfully saved.
 */
@Composable
fun CreateAlertRuleDialog(
    onDismiss: () -> Unit,
    onCreated: () -> Unit
) {
    var unitCategory by remember { mutableStateOf("") }
    var thresholdText by remember { mutableStateOf("85") }
    var severity by remember { mutableStateOf<AlertSeverity>(AlertSeverity.WARNING) }
    var isSaving by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Create Alert Rule") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = unitCategory,
                    onValueChange = { unitCategory = it },
                    label = { Text("Unit Category") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = thresholdText,
                    onValueChange = { thresholdText = it },
                    label = { Text("Occupancy Threshold (%)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                if (errorText != null) {
                    Text(errorText!!, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val threshold = thresholdText.toDoubleOrNull()
                    if (unitCategory.isBlank()) {
                        errorText = "Unit category is required"
                        return@Button
                    }
                    if (threshold == null || threshold < 1.0 || threshold > 100.0) {
                        errorText = "Threshold must be between 1 and 100"
                        return@Button
                    }
                    scope.launch {
                        isSaving = true
                        runCatching {
                            AppContainer.alertRulesApi.createAlertRuleApiV1AnalyticsAlertRulesPost(
                                AlertRuleCreate(
                                    unitCategory = unitCategory.trim(),
                                    thresholdPercentage = threshold,
                                    severity = severity,
                                    isActive = true
                                )
                            )
                        }.fold(
                            onSuccess = { onCreated() },
                            onFailure = { errorText = it.message ?: "Creation failed" }
                        )
                        isSaving = false
                    }
                },
                enabled = !isSaving
            ) {
                Text(if (isSaving) "Saving..." else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text("Cancel")
            }
        }
    )
}
