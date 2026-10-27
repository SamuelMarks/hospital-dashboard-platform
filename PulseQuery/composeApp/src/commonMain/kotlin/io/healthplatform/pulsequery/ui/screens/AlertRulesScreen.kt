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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.ui.screens.alertrules.AlertRulesViewModel
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.active_evaluation
import pulsequery.composeapp.generated.resources.add_rule
import pulsequery.composeapp.generated.resources.alert_rules
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.configured_occupancy_thresholds
import pulsequery.composeapp.generated.resources.create_alert_rule
import pulsequery.composeapp.generated.resources.create_rule
import pulsequery.composeapp.generated.resources.delete_rule
import pulsequery.composeapp.generated.resources.edit_alert_rule
import pulsequery.composeapp.generated.resources.edit_rule
import pulsequery.composeapp.generated.resources.no_alert_rules_configured
import pulsequery.composeapp.generated.resources.occupancy_threshold_pct
import pulsequery.composeapp.generated.resources.refresh_rules
import pulsequery.composeapp.generated.resources.retry
import pulsequery.composeapp.generated.resources.save
import pulsequery.composeapp.generated.resources.save_changes
import pulsequery.composeapp.generated.resources.saving
import pulsequery.composeapp.generated.resources.severity
import pulsequery.composeapp.generated.resources.severity_critical
import pulsequery.composeapp.generated.resources.severity_info
import pulsequery.composeapp.generated.resources.severity_warning
import pulsequery.composeapp.generated.resources.unit_category

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
                title = { Text(stringResource(Res.string.alert_rules)) },
                actions = {
                    IconButton(onClick = { vm.loadRules() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = stringResource(Res.string.refresh_rules))
                    }
                    IconButton(onClick = {
                        vm.clearDialogError()
                        showCreateDialog = true
                    }) {
                        Icon(Icons.Filled.Add, contentDescription = stringResource(Res.string.add_rule))
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
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }
                    ) {
                        Text(text = uiState.errorMessage.orEmpty(), color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { vm.loadRules() }) { Text(stringResource(Res.string.retry)) }
                    }
                }
                uiState.rules.isEmpty() -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            stringResource(Res.string.no_alert_rules_configured),
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = {
                            vm.clearDialogError()
                            showCreateDialog = true
                        }) {
                            Text(stringResource(Res.string.create_rule))
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
                                stringResource(Res.string.configured_occupancy_thresholds),
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
                        contentDescription = stringResource(Res.string.edit_rule),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Filled.Delete,
                        contentDescription = stringResource(Res.string.delete_rule),
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
        title = { Text(stringResource(Res.string.edit_alert_rule)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = unitCategory,
                    onValueChange = { unitCategory = it },
                    label = { Text(stringResource(Res.string.unit_category)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = thresholdText,
                    onValueChange = { thresholdText = it },
                    label = { Text(stringResource(Res.string.occupancy_threshold_pct)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(stringResource(Res.string.severity), style = MaterialTheme.typography.bodyMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        FilterChip(
                            selected = severity == AlertSeverity.INFO,
                            onClick = { severity = AlertSeverity.INFO },
                            label = { Text(stringResource(Res.string.severity_info)) }
                        )
                        FilterChip(
                            selected = severity == AlertSeverity.WARNING,
                            onClick = { severity = AlertSeverity.WARNING },
                            label = { Text(stringResource(Res.string.severity_warning)) }
                        )
                        FilterChip(
                            selected = severity == AlertSeverity.CRITICAL,
                            onClick = { severity = AlertSeverity.CRITICAL },
                            label = { Text(stringResource(Res.string.severity_critical)) }
                        )
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(stringResource(Res.string.active_evaluation), style = MaterialTheme.typography.bodyMedium)
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
                Text(if (uiState.isSaving) stringResource(Res.string.saving) else stringResource(Res.string.save_changes))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !uiState.isSaving) {
                Text(stringResource(Res.string.cancel))
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
        title = { Text(stringResource(Res.string.create_alert_rule)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = unitCategory,
                    onValueChange = { unitCategory = it },
                    label = { Text(stringResource(Res.string.unit_category)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = thresholdText,
                    onValueChange = { thresholdText = it },
                    label = { Text(stringResource(Res.string.occupancy_threshold_pct)) },
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
                Text(if (uiState.isSaving) stringResource(Res.string.saving) else stringResource(Res.string.save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !uiState.isSaving) {
                Text(stringResource(Res.string.cancel))
            }
        }
    )
}
