/**
 * Dialog enabling clinicians to persist custom SQL queries directly as dashboard widgets
 * or reusable template definitions.
 */
package io.healthplatform.pulsequery.ui.screens.editor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.core.result.messageOrDefault
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.category_label
import pulsequery.composeapp.generated.resources.dashboard_widget_dest
import pulsequery.composeapp.generated.resources.description_label
import pulsequery.composeapp.generated.resources.save
import pulsequery.composeapp.generated.resources.save_analytical_query
import pulsequery.composeapp.generated.resources.saving
import pulsequery.composeapp.generated.resources.template_library_dest
import pulsequery.composeapp.generated.resources.title_label

/**
 * Destination options for saving an ad-hoc clinical query.
 */
enum class SaveQueryDestination {
    /** Save directly as a widget on an existing dashboard. */
    DASHBOARD_WIDGET,
    /** Save as a reusable clinical template in the platform library. */
    TEMPLATE
}

/**
 * Modal dialog for capturing query metadata and saving a SQL query to a dashboard or template library.
 *
 * @param sql The analytical SQL query string being saved.
 * @param onDismiss Invoked when the user closes or cancels the dialog.
 * @param onSaved Invoked with a success message when the query is saved.
 * @param viewModel Optional [EditorViewModel] instance for executing persistence operations.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SaveQueryDialog(
    sql: String,
    onDismiss: () -> Unit,
    onSaved: (String) -> Unit,
    viewModel: EditorViewModel? = null
) {
    val scope = rememberCoroutineScope()
    val vm = remember(viewModel, scope) {
        viewModel ?: EditorViewModel(scope = scope)
    }
    var destination by remember { mutableStateOf(SaveQueryDestination.DASHBOARD_WIDGET) }
    var title by remember { mutableStateOf("") }
    var visualization by remember { mutableStateOf("table") }
    var category by remember { mutableStateOf("Clinical") }
    var description by remember { mutableStateOf("Custom analytical query from SQL Editor") }

    var dashboards by remember { mutableStateOf<List<DashboardResponse>>(emptyList()) }
    var selectedDashboardId by remember { mutableStateOf<String?>(null) }
    var isDashboardsLoading by remember { mutableStateOf(false) }

    var isSaving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    var vizDropdownExpanded by remember { mutableStateOf(false) }
    var dashDropdownExpanded by remember { mutableStateOf(false) }

    val availableVisualizations = listOf("table", "bar_chart", "line_chart", "pie_chart", "heatmap")

    LaunchedEffect(destination, vm) {
        if (destination == SaveQueryDestination.DASHBOARD_WIDGET && dashboards.isEmpty()) {
            isDashboardsLoading = true
            vm.loadAvailableDashboards().fold(
                onSuccess = { list ->
                    dashboards = list
                    if (dashboards.isNotEmpty() && selectedDashboardId == null) {
                        selectedDashboardId = dashboards.first().id
                    }
                },
                onFailure = { e ->
                    errorMessage = "Failed to load dashboards: ${e.messageOrDefault("Unknown error")}"
                }
            )
            isDashboardsLoading = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(Res.string.save_analytical_query)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = destination == SaveQueryDestination.DASHBOARD_WIDGET,
                        onClick = { destination = SaveQueryDestination.DASHBOARD_WIDGET },
                        label = { Text(stringResource(Res.string.dashboard_widget_dest)) }
                    )
                    FilterChip(
                        selected = destination == SaveQueryDestination.TEMPLATE,
                        onClick = { destination = SaveQueryDestination.TEMPLATE },
                        label = { Text(stringResource(Res.string.template_library_dest)) }
                    )
                }

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(Res.string.title_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                if (destination == SaveQueryDestination.DASHBOARD_WIDGET) {
                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { dashDropdownExpanded = true },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !isDashboardsLoading && dashboards.isNotEmpty()
                        ) {
                            val selectedName = dashboards.find { it.id == selectedDashboardId }?.name ?: "Select Target Dashboard"
                            Text(if (isDashboardsLoading) "Loading dashboards..." else selectedName)
                            Spacer(modifier = Modifier.weight(1f))
                            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                        }
                        DropdownMenu(
                            expanded = dashDropdownExpanded,
                            onDismissRequest = { dashDropdownExpanded = false }
                        ) {
                            dashboards.forEach { dash ->
                                DropdownMenuItem(
                                    text = { Text(dash.name) },
                                    onClick = {
                                        selectedDashboardId = dash.id
                                        dashDropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { vizDropdownExpanded = true },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Visualization: $visualization")
                            Spacer(modifier = Modifier.weight(1f))
                            Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                        }
                        DropdownMenu(
                            expanded = vizDropdownExpanded,
                            onDismissRequest = { vizDropdownExpanded = false }
                        ) {
                            availableVisualizations.forEach { viz ->
                                DropdownMenuItem(
                                    text = { Text(viz) },
                                    onClick = {
                                        visualization = viz
                                        vizDropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = category,
                        onValueChange = { category = it },
                        label = { Text(stringResource(Res.string.category_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text(stringResource(Res.string.description_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                errorMessage?.let { err ->
                    Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (title.isBlank()) {
                        errorMessage = "Title is required"
                        return@Button
                    }
                    val targetDashId = selectedDashboardId
                    if (destination == SaveQueryDestination.DASHBOARD_WIDGET && targetDashId == null) {
                        errorMessage = "Target dashboard is required"
                        return@Button
                    }

                    scope.launch {
                        isSaving = true
                        errorMessage = null
                        vm.saveQuery(
                            destination = destination,
                            title = title,
                            sql = sql,
                            dashboardId = targetDashId,
                            visualization = visualization,
                            category = category,
                            description = description
                        ).fold(
                            onSuccess = { successMsg ->
                                onSaved(successMsg)
                            },
                            onFailure = { e ->
                                errorMessage = e.messageOrDefault("Failed to save query")
                            }
                        )
                        isSaving = false
                    }
                },
                enabled = !isSaving
            ) {
                Text(if (isSaving) stringResource(Res.string.saving) else stringResource(Res.string.save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSaving) {
                Text(stringResource(Res.string.cancel))
            }
        }
    )
}
