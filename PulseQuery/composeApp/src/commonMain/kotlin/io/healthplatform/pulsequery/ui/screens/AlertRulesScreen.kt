/**
 * Component for rendering the AlertRulesScreen in Compose Multiplatform.
 * Provides administrators and clinical analysts with capabilities to review
 * and configure hospital capacity alerting thresholds, delegating state and API calls
 * to [AlertRulesViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.ui.screens.alertrules.AlertRulesViewModel

/**
 * Screen displaying and managing clinical alert rules for hospital occupancy.
 *
 * @param viewModel Optional [AlertRulesViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlertRulesScreen(
    viewModel: AlertRulesViewModel? = null
) {
    val scope = rememberCoroutineScope()
    val vm = remember(viewModel, scope) {
        viewModel ?: AlertRulesViewModel(scope = scope)
    }

    val uiState by vm.state.collectAsState()
    var showCreateDialog by remember { mutableStateOf(false) }
    var ruleToEdit by remember { mutableStateOf<AlertRuleResponse?>(null) }

    LaunchedEffect(vm) {
        vm.loadRules()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Alert Rules") },
                actions = {
                    IconButton(onClick = { vm.loadRules() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh Rules")
                    }
                    IconButton(onClick = {
                        vm.clearDialogError()
                        showCreateDialog = true
                    }) {
                        Icon(Icons.Filled.Add, contentDescription = "Add Rule")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentAlignment = Alignment.Center
        ) {
            when {
                uiState.isLoading -> CircularProgressIndicator()
                uiState.errorMessage != null -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = uiState.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { vm.loadRules() }) { Text("Retry") }
                    }
                }
                uiState.rules.isEmpty() -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "No alert rules configured",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = {
                            vm.clearDialogError()
                            showCreateDialog = true
                        }) {
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
                        items(uiState.rules, key = { it.id }) { rule ->
                            AlertRuleCard(
                                rule = rule,
                                onEdit = {
                                    vm.clearDialogError()
                                    ruleToEdit = rule
                                },
                                onDelete = {
                                    vm.deleteRule(rule.id)
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
            },
            viewModel = vm
        )
    }

    ruleToEdit?.let { targetRule ->
        EditAlertRuleDialog(
            rule = targetRule,
            onDismiss = { ruleToEdit = null },
            onUpdated = {
                ruleToEdit = null
            },
            viewModel = vm
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
                    progress = { (rule.thresholdPercentage / 100.0).toFloat().coerceIn(0f, 1f) },
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
 * @param viewModel Optional [AlertRulesViewModel] instance for state orchestration.
 */
@Composable
fun EditAlertRuleDialog(
    rule: AlertRuleResponse,
    onDismiss: () -> Unit,
    onUpdated: () -> Unit,
    viewModel: AlertRulesViewModel? = null
) {
    val scope = rememberCoroutineScope()
    val vm = remember(viewModel, scope) {
        viewModel ?: AlertRulesViewModel(scope = scope)
    }
    val uiState by vm.state.collectAsState()

    var unitCategory by remember(rule.id) { mutableStateOf(rule.unitCategory) }
    var thresholdText by remember(rule.id) { mutableStateOf(rule.thresholdPercentage.toString()) }
    var severity by remember(rule.id) { mutableStateOf<AlertSeverity>(rule.severity ?: AlertSeverity.WARNING) }
    var isActive by remember(rule.id) { mutableStateOf(rule.isActive ?: true) }

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
                uiState.dialogError?.let { err ->
                    Text(err, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    vm.updateRule(
                        ruleId = rule.id,
                        unitCategory = unitCategory,
                        thresholdText = thresholdText,
                        severity = severity,
                        isActive = isActive,
                        onSuccess = onUpdated
                    )
                },
                enabled = !uiState.isSaving
            ) {
                Text(if (uiState.isSaving) "Saving..." else "Save Changes")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !uiState.isSaving) {
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
 * @param viewModel Optional [AlertRulesViewModel] instance for state orchestration.
 */
@Composable
fun CreateAlertRuleDialog(
    onDismiss: () -> Unit,
    onCreated: () -> Unit,
    viewModel: AlertRulesViewModel? = null
) {
    val scope = rememberCoroutineScope()
    val vm = remember(viewModel, scope) {
        viewModel ?: AlertRulesViewModel(scope = scope)
    }
    val uiState by vm.state.collectAsState()

    var unitCategory by remember { mutableStateOf("") }
    var thresholdText by remember { mutableStateOf("85") }
    val severity by remember { mutableStateOf<AlertSeverity>(AlertSeverity.WARNING) }

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
                uiState.dialogError?.let { err ->
                    Text(err, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    vm.createRule(
                        unitCategory = unitCategory,
                        thresholdText = thresholdText,
                        severity = severity,
                        onSuccess = onCreated
                    )
                },
                enabled = !uiState.isSaving
            ) {
                Text(if (uiState.isSaving) "Saving..." else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !uiState.isSaving) {
                Text("Cancel")
            }
        }
    )
}
