/**
 * Dialog enabling clinicians to persist custom SQL queries directly as dashboard widgets
 * or reusable template definitions.
 */
package io.healthplatform.pulsequery.ui.screens.editor

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.TemplateCreate
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

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
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SaveQueryDialog(
    sql: String,
    onDismiss: () -> Unit,
    onSaved: (String) -> Unit
) {
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

    val scope = rememberCoroutineScope()
    val availableVisualizations = listOf("table", "bar_chart", "line_chart", "pie_chart", "heatmap")

    LaunchedEffect(destination) {
        if (destination == SaveQueryDestination.DASHBOARD_WIDGET && dashboards.isEmpty()) {
            isDashboardsLoading = true
            runCatching {
                val res = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
                res.body()
            }.fold(
                onSuccess = { list ->
                    dashboards = list
                    if (dashboards.isNotEmpty() && selectedDashboardId == null) {
                        selectedDashboardId = dashboards.first().id
                    }
                },
                onFailure = { e ->
                    errorMessage = "Failed to load dashboards: ${e.message}"
                }
            )
            isDashboardsLoading = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Save Analytical Query") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = destination == SaveQueryDestination.DASHBOARD_WIDGET,
                        onClick = { destination = SaveQueryDestination.DASHBOARD_WIDGET },
                        label = { Text("Dashboard Widget") }
                    )
                    FilterChip(
                        selected = destination == SaveQueryDestination.TEMPLATE,
                        onClick = { destination = SaveQueryDestination.TEMPLATE },
                        label = { Text("Template Library") }
                    )
                }

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Title") },
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
                        label = { Text("Category") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = { Text("Description") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                if (errorMessage != null) {
                    Text(errorMessage!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
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
                    if (destination == SaveQueryDestination.DASHBOARD_WIDGET && selectedDashboardId == null) {
                        errorMessage = "Target dashboard is required"
                        return@Button
                    }

                    scope.launch {
                        isSaving = true
                        errorMessage = null
                        runCatching {
                            if (destination == SaveQueryDestination.DASHBOARD_WIDGET) {
                                val widgetIn = WidgetIn.Sql(
                                    title = title.trim(),
                                    visualization = visualization,
                                    config = SqlConfig(query = sql)
                                )
                                AppContainer.dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(
                                    selectedDashboardId!!,
                                    widgetIn
                                )
                                "Widget successfully added to dashboard"
                            } else {
                                val templateCreate = TemplateCreate(
                                    title = title.trim(),
                                    sqlTemplate = sql,
                                    category = category.trim().ifBlank { "Clinical" },
                                    description = description.trim()
                                )
                                AppContainer.templatesApi.createTemplateApiV1TemplatesPost(templateCreate)
                                "Template successfully registered in library"
                            }
                        }.fold(
                            onSuccess = { successMsg ->
                                onSaved(successMsg)
                            },
                            onFailure = { e ->
                                errorMessage = e.message ?: "Failed to save query"
                            }
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
