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
import io.healthplatform.pulsequery.api.models.ModelInfo
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.api.models.WidgetUpdate
import io.healthplatform.pulsequery.core.model.ProcessorId
import io.healthplatform.pulsequery.core.model.ProcessorSelectionOption
import io.healthplatform.pulsequery.core.model.TypedWidgetConfig
import io.healthplatform.pulsequery.core.model.extractWidgetSqlConfig
import io.healthplatform.pulsequery.core.model.parseTypedWidgetConfig
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runResultPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.wizard.mapModelInfoToProcessorSelection
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.allow_natural_text_label
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.edit_widget_title_blank_error
import pulsequery.composeapp.generated.resources.edit_widget_title_format
import pulsequery.composeapp.generated.resources.natural_text_prompt_label
import pulsequery.composeapp.generated.resources.processor_label
import pulsequery.composeapp.generated.resources.save_changes
import pulsequery.composeapp.generated.resources.select_processor_content_desc
import pulsequery.composeapp.generated.resources.visualization_type
import pulsequery.composeapp.generated.resources.widget_subtitle_label
import pulsequery.composeapp.generated.resources.widget_subtitle_placeholder
import pulsequery.composeapp.generated.resources.widget_title

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
 * Extracts the editable primary content string (SQL query, Markdown text, or HTTP URL) from a [WidgetResponse].
 *
 * @param widget Source widget response.
 * @return Initial editable content string.
 */
internal fun extractInitialWidgetContent(widget: WidgetResponse): String {
    return when (val parsed = parseTypedWidgetConfig(widget.type, widget.config)) {
        is TypedWidgetConfig.Text -> parsed.content
        is TypedWidgetConfig.Http -> parsed.url
        is TypedWidgetConfig.Sql -> parsed.query
    }
}

/**
 * Maps discovered [ModelInfo] entries to [ProcessorSelectionOption] choices, ensuring [ProcessorSelectionOption.SQL_DEFAULT] is always present.
 *
 * @param models List of backend AI/SQL models.
 * @return Complete list of selectable processor options.
 */
internal fun resolveAvailableProcessors(models: List<ModelInfo>): List<ProcessorSelectionOption> {
    val mapped = models.map { mapModelInfoToProcessorSelection(it) }
    return if (mapped.any { it.id == ProcessorId.SQL_NO_MODEL }) {
        mapped
    } else {
        listOf(ProcessorSelectionOption.SQL_DEFAULT) + mapped
    }
}

/**
 * Resolves the human-readable processor display label for the currently selected [ProcessorId].
 *
 * @param availableProcessors Available processor options.
 * @param selectedProcessor Currently selected processor identifier.
 * @return Display name or raw wire identifier fallback.
 */
internal fun resolveProcessorDisplayName(
    availableProcessors: List<ProcessorSelectionOption>,
    selectedProcessor: ProcessorId
): String {
    val matched = availableProcessors.firstOrNull { it.id == selectedProcessor }
    return if (matched != null) matched.displayName else selectedProcessor.value
}

/**
 * Resolves the form field label for the primary widget content input based on widget type.
 *
 * @param widgetType Widget type string (`TEXT`, `HTTP`, or `SQL`).
 * @return Input label text.
 */
internal fun resolveWidgetContentLabel(widgetType: String): String {
    return when (widgetType.uppercase()) {
        "TEXT" -> "Markdown Content"
        "HTTP" -> "HTTP Endpoint URL"
        else -> "SQL Query"
    }
}

/**
 * Builds the [WidgetUpdate] request payload from edited form state.
 *
 * @param widget Original widget being updated.
 * @param title Updated widget title.
 * @param subtitle Updated widget subtitle (blank clears subtitle).
 * @param selectedViz Selected visualization identifier.
 * @param sqlConfig Configured [TypedWidgetConfig.Sql] containing query/content, natural text toggle, processor, and prompt.
 * @return Constructed [WidgetUpdate] payload.
 */
internal fun buildWidgetUpdatePayload(
    widget: WidgetResponse,
    title: String,
    subtitle: String,
    selectedViz: String,
    sqlConfig: TypedWidgetConfig.Sql
): WidgetUpdate {
    val newConfigMap = widget.config.toMutableMap()
    val queryOrContent = sqlConfig.query
    when (widget.type.uppercase()) {
        "TEXT" -> {
            newConfigMap["content"] = JsonPrimitive(queryOrContent)
        }
        "HTTP" -> {
            newConfigMap["url"] = JsonPrimitive(queryOrContent)
        }
        else -> {
            newConfigMap["query"] = JsonPrimitive(queryOrContent)
            if (
                sqlConfig.allowNaturalText ||
                sqlConfig.processor != ProcessorId.SQL_NO_MODEL ||
                newConfigMap.containsKey("allow_natural_text")
            ) {
                newConfigMap["allow_natural_text"] = JsonPrimitive(sqlConfig.allowNaturalText)
                newConfigMap["processor"] = JsonPrimitive(sqlConfig.processor.value)
                if (sqlConfig.naturalTextPrompt.isNotBlank()) {
                    newConfigMap["natural_text_prompt"] = JsonPrimitive(sqlConfig.naturalTextPrompt.trim())
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
    return WidgetUpdate(
        title = title,
        subtitle = trimmedSub,
        visualization = selectedViz,
        config = JsonObject(newConfigMap)
    )
}

/**
 * Submits a [WidgetUpdate] request to the backend [DashboardsApi] wrapped in a [Result].
 *
 * @param api Target [DashboardsApi] client.
 * @param widgetId ID of the widget to update.
 * @param updateReq Constructed [WidgetUpdate] payload.
 * @return [Result] containing the updated [WidgetResponse] or error.
 */
internal suspend fun submitWidgetUpdate(
    api: DashboardsApi,
    widgetId: String,
    updateReq: WidgetUpdate
): Result<WidgetResponse> {
    return runResultPulseAsync {
        api.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(
            widgetId = widgetId,
            widgetUpdate = updateReq
        ).asResult()
    }
}

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
    var queryOrContent by remember { mutableStateOf(extractInitialWidgetContent(widget)) }

    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(aiApi) {
        val resolvedAiApi = aiApi ?: AppContainer.aiApi
        runResultPulseAsync {
            resolvedAiApi.listAvailableModelsApiV1AiModelsGet(includeSql = true, discoverOllama = true).asResult()
        }.onSuccess { models ->
            availableProcessors = resolveAvailableProcessors(models)
        }
    }

    val blankTitleError = stringResource(Res.string.edit_widget_title_blank_error)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { EditWidgetDialogTitle(widgetTitle = widget.title) },
        text = {
            EditWidgetDialogForm(
                widgetType = widget.type,
                title = title,
                onTitleChange = { title = it },
                subtitle = subtitle,
                onSubtitleChange = { subtitle = it },
                selectedViz = selectedViz,
                onSelectViz = {
                    selectedViz = it
                    showVizDropdown = false
                },
                showVizDropdown = showVizDropdown,
                onVizDropdownExpandedChange = { showVizDropdown = it },
                allowNaturalText = allowNaturalText,
                onAllowNaturalTextChange = { allowNaturalText = it },
                selectedProcessor = selectedProcessor,
                onSelectProcessor = {
                    selectedProcessor = it
                    showProcessorDropdown = false
                },
                showProcessorDropdown = showProcessorDropdown,
                onProcessorDropdownExpandedChange = { showProcessorDropdown = it },
                availableProcessors = availableProcessors,
                naturalTextPrompt = naturalTextPrompt,
                onNaturalTextPromptChange = { naturalTextPrompt = it },
                queryOrContent = queryOrContent,
                onQueryOrContentChange = { queryOrContent = it },
                errorMessage = errorMessage
            )
        },
        confirmButton = {
            EditWidgetDialogConfirmButton(
                isLoading = isLoading,
                onConfirm = {
                    if (title.isBlank()) {
                        errorMessage = blankTitleError
                    } else {
                        scope.launch {
                            isLoading = true
                            errorMessage = null
                            val api = dashboardsApi ?: AppContainer.dashboardsApi
                            val updateReq = buildWidgetUpdatePayload(
                                widget = widget,
                                title = title,
                                subtitle = subtitle,
                                selectedViz = selectedViz,
                                sqlConfig = TypedWidgetConfig.Sql(
                                    query = queryOrContent,
                                    allowNaturalText = allowNaturalText,
                                    processor = selectedProcessor,
                                    naturalTextPrompt = naturalTextPrompt
                                )
                            )
                            submitWidgetUpdate(api, widget.id, updateReq).fold(
                                onSuccess = { updated -> onWidgetUpdated(updated) },
                                onFailure = { e -> errorMessage = e.messageOrDefault("Failed to update widget") }
                            )
                            isLoading = false
                        }
                    }
                }
            )
        },
        dismissButton = {
            EditWidgetDialogDismissButton(isLoading = isLoading, onDismiss = onDismiss)
        }
    )
}

/**
 * Renders the dialog title header for [EditWidgetDialog].
 *
 * @param widgetTitle Current widget title string.
 */
@Composable
private fun EditWidgetDialogTitle(widgetTitle: String) {
    Text(stringResource(Res.string.edit_widget_title_format, widgetTitle))
}

/**
 * Renders the scrollable form fields inside [EditWidgetDialog].
 *
 * @param widgetType Widget type identifier (`SQL`, `TEXT`, or `HTTP`).
 * @param title Current title field value.
 * @param onTitleChange Callback invoked when title changes.
 * @param subtitle Current subtitle field value.
 * @param onSubtitleChange Callback invoked when subtitle changes.
 * @param selectedViz Selected visualization identifier.
 * @param onSelectViz Callback invoked when a visualization is chosen.
 * @param showVizDropdown Whether the visualization dropdown is expanded.
 * @param onVizDropdownExpandedChange Callback invoked when visualization dropdown expansion changes.
 * @param allowNaturalText Whether natural-language prompt mode is enabled.
 * @param onAllowNaturalTextChange Callback invoked when natural-language toggle changes.
 * @param selectedProcessor Currently selected processor ID.
 * @param onSelectProcessor Callback invoked when a processor option is selected.
 * @param showProcessorDropdown Whether the processor dropdown is expanded.
 * @param onProcessorDropdownExpandedChange Callback invoked when processor dropdown expansion changes.
 * @param availableProcessors List of selectable processor options.
 * @param naturalTextPrompt Current natural-language prompt text.
 * @param onNaturalTextPromptChange Callback invoked when natural-language prompt changes.
 * @param queryOrContent Current SQL query, Markdown text, or HTTP URL.
 * @param onQueryOrContentChange Callback invoked when primary content changes.
 * @param errorMessage Optional validation or submission error message.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditWidgetDialogForm(
    widgetType: String,
    title: String,
    onTitleChange: (String) -> Unit,
    subtitle: String,
    onSubtitleChange: (String) -> Unit,
    selectedViz: String,
    onSelectViz: (String) -> Unit,
    showVizDropdown: Boolean,
    onVizDropdownExpandedChange: (Boolean) -> Unit,
    allowNaturalText: Boolean,
    onAllowNaturalTextChange: (Boolean) -> Unit,
    selectedProcessor: ProcessorId,
    onSelectProcessor: (ProcessorId) -> Unit,
    showProcessorDropdown: Boolean,
    onProcessorDropdownExpandedChange: (Boolean) -> Unit,
    availableProcessors: List<ProcessorSelectionOption>,
    naturalTextPrompt: String,
    onNaturalTextPromptChange: (String) -> Unit,
    queryOrContent: String,
    onQueryOrContentChange: (String) -> Unit,
    errorMessage: String?
) {
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
            onValueChange = onTitleChange,
            label = { Text(stringResource(Res.string.widget_title)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = subtitle,
            onValueChange = onSubtitleChange,
            label = { Text(stringResource(Res.string.widget_subtitle_label)) },
            placeholder = { Text(stringResource(Res.string.widget_subtitle_placeholder)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        ExposedDropdownMenuBox(
            expanded = showVizDropdown,
            onExpandedChange = onVizDropdownExpandedChange
        ) {
            OutlinedTextField(
                value = selectedViz,
                onValueChange = {},
                readOnly = true,
                label = { Text(stringResource(Res.string.visualization_type)) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = showVizDropdown) },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
            )
            ExposedDropdownMenu(
                expanded = showVizDropdown,
                onDismissRequest = { onVizDropdownExpandedChange(false) }
            ) {
                AVAILABLE_VISUALIZATIONS.forEach { viz ->
                    DropdownMenuItem(
                        text = { Text(viz.replaceFirstChar { it.uppercase() }) },
                        onClick = { onSelectViz(viz) }
                    )
                }
            }
        }

        if (widgetType.equals("SQL", ignoreCase = true)) {
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
                    onCheckedChange = onAllowNaturalTextChange,
                    modifier = Modifier.semantics { contentDescription = toggleLabel }
                )
            }

            val procDisplay = resolveProcessorDisplayName(availableProcessors, selectedProcessor)

            ExposedDropdownMenuBox(
                expanded = showProcessorDropdown,
                onExpandedChange = onProcessorDropdownExpandedChange
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
                    onDismissRequest = { onProcessorDropdownExpandedChange(false) }
                ) {
                    availableProcessors.forEach { opt ->
                        DropdownMenuItem(
                            text = { Text(opt.displayName) },
                            onClick = { onSelectProcessor(opt.id) }
                        )
                    }
                }
            }

            if (allowNaturalText) {
                OutlinedTextField(
                    value = naturalTextPrompt,
                    onValueChange = onNaturalTextPromptChange,
                    label = { Text(stringResource(Res.string.natural_text_prompt_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        val labelText = resolveWidgetContentLabel(widgetType)

        OutlinedTextField(
            value = queryOrContent,
            onValueChange = onQueryOrContentChange,
            label = { Text(labelText) },
            minLines = 3,
            maxLines = 8,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

/**
 * Renders the primary Save Changes confirmation button for [EditWidgetDialog].
 *
 * @param isLoading Whether a save operation is currently in progress.
 * @param onConfirm Callback invoked when the button is clicked.
 */
@Composable
private fun EditWidgetDialogConfirmButton(
    isLoading: Boolean,
    onConfirm: () -> Unit
) {
    Button(
        onClick = onConfirm,
        enabled = !isLoading
    ) {
        EditWidgetConfirmButtonContent(isLoading = isLoading)
    }
}

/**
 * Renders the interior content of [EditWidgetDialogConfirmButton].
 *
 * @param isLoading Whether a save operation is currently in progress.
 */
@Composable
private fun EditWidgetConfirmButtonContent(isLoading: Boolean) {
    if (isLoading) {
        CircularProgressIndicator(
            modifier = Modifier.size(16.dp),
            strokeWidth = 2.dp,
            color = MaterialTheme.colorScheme.onPrimary
        )
    } else {
        Text(stringResource(Res.string.save_changes))
    }
}

/**
 * Renders the Cancel dismissal button for [EditWidgetDialog].
 *
 * @param isLoading Whether a save operation is currently in progress.
 * @param onDismiss Callback invoked when the button is clicked.
 */
@Composable
private fun EditWidgetDialogDismissButton(
    isLoading: Boolean,
    onDismiss: () -> Unit
) {
    TextButton(onClick = onDismiss, enabled = !isLoading) {
        Text(stringResource(Res.string.cancel))
    }
}
