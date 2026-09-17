/**
 * Edit Widget Dialog module providing in-place editing of dashboard widget configurations.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.api.models.WidgetUpdate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

/**
 * Standard visualization options available for dashboard widgets.
 */
val AVAILABLE_VISUALIZATIONS: List<String> = listOf(
    "table",
    "barchart",
    "linechart",
    "pie",
    "metric",
    "heatmap",
    "markdown"
)

/**
 * Dialog allowing clinicians and analysts to modify an existing dashboard widget's configuration.
 *
 * @param widget The target [WidgetResponse] to edit.
 * @param onDismiss Callback invoked when dismissing the dialog without saving.
 * @param onWidgetUpdated Callback invoked with the updated [WidgetResponse] upon successful save.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditWidgetDialog(
    widget: WidgetResponse,
    onDismiss: () -> Unit,
    onWidgetUpdated: (WidgetResponse) -> Unit
) {
    var title by remember { mutableStateOf(widget.title) }
    var selectedViz by remember { mutableStateOf(widget.visualization.lowercase()) }
    var showVizDropdown by remember { mutableStateOf(false) }

    val initialContent = when (widget.type.uppercase()) {
        "TEXT" -> (widget.config["content"] as? JsonPrimitive)?.content
            ?: (widget.config["text"] as? JsonPrimitive)?.content ?: ""
        "HTTP" -> (widget.config["url"] as? JsonPrimitive)?.content ?: ""
        else -> (widget.config["query"] as? JsonPrimitive)?.content ?: ""
    }
    var queryOrContent by remember { mutableStateOf(initialContent) }

    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit Widget: ${widget.title}") },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }

                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Widget Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                ExposedDropdownMenuBox(
                    expanded = showVizDropdown,
                    onExpandedChange = { showVizDropdown = it }
                ) {
                    OutlinedTextField(
                        value = selectedViz,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Visualization Type") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showVizDropdown) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    )
                    ExposedDropdownMenu(
                        expanded = showVizDropdown,
                        onDismissRequest = { showVizDropdown = false }
                    ) {
                        AVAILABLE_VISUALIZATIONS.forEach { viz ->
                            DropdownMenuItem(
                                text = { Text(viz.replaceFirstChar { it.uppercase() }) },
                                onClick = {
                                    selectedViz = viz
                                    showVizDropdown = false
                                }
                            )
                        }
                    }
                }

                val labelText = when (widget.type.uppercase()) {
                    "TEXT" -> "Markdown Content"
                    "HTTP" -> "HTTP Endpoint URL"
                    else -> "SQL Query"
                }

                OutlinedTextField(
                    value = queryOrContent,
                    onValueChange = { queryOrContent = it },
                    label = { Text(labelText) },
                    minLines = 3,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (title.isBlank()) {
                        errorMessage = "Widget title cannot be blank"
                        return@Button
                    }
                    scope.launch {
                        isLoading = true
                        errorMessage = null
                        runCatching {
                            val newConfigMap = widget.config.toMutableMap()
                            when (widget.type.uppercase()) {
                                "TEXT" -> {
                                    newConfigMap["content"] = JsonPrimitive(queryOrContent)
                                }
                                "HTTP" -> {
                                    newConfigMap["url"] = JsonPrimitive(queryOrContent)
                                }
                                else -> {
                                    newConfigMap["query"] = JsonPrimitive(queryOrContent)
                                }
                            }
                            val updateReq = WidgetUpdate(
                                title = title,
                                visualization = selectedViz,
                                config = JsonObject(newConfigMap)
                            )
                            val response = AppContainer.dashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(
                                widgetId = widget.id,
                                widgetUpdate = updateReq
                            )
                            response.body()
                        }.fold(
                            onSuccess = { updated ->
                                onWidgetUpdated(updated)
                            },
                            onFailure = { e ->
                                errorMessage = e.message ?: "Failed to update widget"
                            }
                        )
                        isLoading = false
                    }
                },
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text("Save Changes")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isLoading) {
                Text("Cancel")
            }
        }
    )
}
