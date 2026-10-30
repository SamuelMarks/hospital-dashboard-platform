/**
 * Edit Widget Dialog module providing in-place editing of dashboard widget configurations.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.api.models.WidgetUpdate
import io.healthplatform.pulsequery.core.model.ProcessorId
import io.healthplatform.pulsequery.core.model.ProcessorSelectionOption
import io.healthplatform.pulsequery.core.model.TypedWidgetConfig
import io.healthplatform.pulsequery.core.model.extractWidgetSqlConfig
import io.healthplatform.pulsequery.core.model.parseTypedWidgetConfig
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.wizard.mapModelInfoToProcessorSelection
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.allow_natural_text_label
import pulsequery.composeapp.generated.resources.natural_text_prompt_label
import pulsequery.composeapp.generated.resources.processor_label
import pulsequery.composeapp.generated.resources.select_processor_content_desc
import pulsequery.composeapp.generated.resources.widget_subtitle_label
import pulsequery.composeapp.generated.resources.widget_subtitle_placeholder

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
 * @param dashboardsApi Optional [DashboardsApi] override for testing.
 * @param aiApi Optional [AiApi] override for loading selectable processors.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditWidgetDialog(
    widget: WidgetResponse,
    onDismiss: () -> Unit,
    onWidgetUpdated: (WidgetResponse) -> Unit,
    dashboardsApi: DashboardsApi? = null,
    aiApi: AiApi? = null
) {
    var title by remember { mutableStateOf(widget.title) }
    var subtitle by remember { mutableStateOf(extractWidgetSubtitle(widget).orEmpty()) }
    var selectedViz by remember { mutableStateOf(widget.visualization.lowercase()) }
    var showVizDropdown by remember { mutableStateOf(false) }

    val sqlConfig = extractWidgetSqlConfig(widget.config)
    var allowNaturalText by remember { mutableStateOf(sqlConfig.allowNaturalText) }
    var selectedProcessor by remember { mutableStateOf(sqlConfig.processor) }
    var naturalTextPrompt by remember { mutableStateOf(sqlConfig.naturalTextPrompt) }
    var showProcessorDropdown by remember { mutableStateOf(false) }
    var availableProcessors by remember { mutableStateOf(listOf(ProcessorSelectionOption.SQL_DEFAULT)) }

    val initialContent = when (val parsed = parseTypedWidgetConfig(widget.type, widget.config)) {
        is TypedWidgetConfig.Text -> parsed.content
        is TypedWidgetConfig.Http -> parsed.url
        is TypedWidgetConfig.Sql -> parsed.query
    }
    var queryOrContent by remember { mutableStateOf(initialContent) }

    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(aiApi) {
        if (aiApi != null) {
            runCatchingPulseAsync {
                aiApi.listAvailableModelsApiV1AiModelsGet(includeSql = true, discoverOllama = true)
                    .asResult()
                    .getOrThrow()
            }.onSuccess { models ->
                val mapped = models.map { mapModelInfoToProcessorSelection(it) }
                availableProcessors = if (mapped.any { it.id == ProcessorId.SQL_NO_MODEL }) {
                    mapped
                } else {
                    listOf(ProcessorSelectionOption.SQL_DEFAULT) + mapped
                }
            }
        }
    }

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
                errorMessage?.let { err ->
                    Text(
                        text = err,
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

                OutlinedTextField(
                    value = subtitle,
                    onValueChange = { subtitle = it },
                    label = { Text(stringResource(Res.string.widget_subtitle_label)) },
                    placeholder = { Text(stringResource(Res.string.widget_subtitle_placeholder)) },
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
                            .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
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

                if (widget.type.equals("SQL", ignoreCase = true)) {
                    val toggleLabel = stringResource(Res.string.allow_natural_text_label)
                    val procDesc = stringResource(Res.string.select_processor_content_desc)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = toggleLabel, style = MaterialTheme.typography.bodyMedium)
                        Switch(
                            checked = allowNaturalText,
                            onCheckedChange = { allowNaturalText = it },
                            modifier = Modifier.semantics { contentDescription = toggleLabel }
                        )
                    }

                    val procDisplay = availableProcessors.firstOrNull { it.id == selectedProcessor }?.displayName
                        ?: selectedProcessor.value

                    ExposedDropdownMenuBox(
                        expanded = showProcessorDropdown,
                        onExpandedChange = { showProcessorDropdown = it }
                    ) {
                        OutlinedTextField(
                            value = procDisplay,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text(stringResource(Res.string.processor_label)) },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showProcessorDropdown) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                                .semantics { contentDescription = procDesc }
                        )
                        ExposedDropdownMenu(
                            expanded = showProcessorDropdown,
                            onDismissRequest = { showProcessorDropdown = false }
                        ) {
                            availableProcessors.forEach { opt ->
                                DropdownMenuItem(
                                    text = { Text(opt.displayName) },
                                    onClick = {
                                        selectedProcessor = opt.id
                                        showProcessorDropdown = false
                                    }
                                )
                            }
                        }
                    }

                    if (allowNaturalText) {
                        OutlinedTextField(
                            value = naturalTextPrompt,
                            onValueChange = { naturalTextPrompt = it },
                            label = { Text(stringResource(Res.string.natural_text_prompt_label)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
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
                        val api = dashboardsApi ?: AppContainer.dashboardsApi
                        runCatchingPulseAsync {
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
                                    if (allowNaturalText || selectedProcessor != ProcessorId.SQL_NO_MODEL || newConfigMap.containsKey("allow_natural_text")) {
                                        newConfigMap["allow_natural_text"] = JsonPrimitive(allowNaturalText)
                                        newConfigMap["processor"] = JsonPrimitive(selectedProcessor.value)
                                        if (naturalTextPrompt.isNotBlank()) {
                                            newConfigMap["natural_text_prompt"] = JsonPrimitive(naturalTextPrompt.trim())
                                        }
                                    }
                                }
                            }
                            val trimmedSub = subtitle.trim().takeIf { it.isNotEmpty() }
                            if (trimmedSub != null) {
                                newConfigMap["subtitle"] = JsonPrimitive(trimmedSub)
                            } else {
                                newConfigMap.remove("subtitle")
                            }
                            val updateReq = WidgetUpdate(
                                title = title,
                                subtitle = trimmedSub,
                                visualization = selectedViz,
                                config = JsonObject(newConfigMap)
                            )
                            val response = api.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(
                                widgetId = widget.id,
                                widgetUpdate = updateReq
                            )
                            response.asResult().getOrThrow()
                        }.fold(
                            onSuccess = { updated ->
                                onWidgetUpdated(updated)
                            },
                            onFailure = { e ->
                                errorMessage = e.messageOrDefault("Failed to update widget")
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
