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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.result.messageOrDefault
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.category_label
import pulsequery.composeapp.generated.resources.dashboard_widget_dest
import pulsequery.composeapp.generated.resources.description_label
import pulsequery.composeapp.generated.resources.save
import pulsequery.composeapp.generated.resources.save_analytical_query
import pulsequery.composeapp.generated.resources.save_query_dashboard_required
import pulsequery.composeapp.generated.resources.save_query_expand_dashboard_desc
import pulsequery.composeapp.generated.resources.save_query_expand_visualization_desc
import pulsequery.composeapp.generated.resources.save_query_loading_dashboards
import pulsequery.composeapp.generated.resources.save_query_select_target_dashboard
import pulsequery.composeapp.generated.resources.save_query_title_required
import pulsequery.composeapp.generated.resources.save_query_visualization_fmt
import pulsequery.composeapp.generated.resources.template_library_dest
import pulsequery.composeapp.generated.resources.template_registered_success
import pulsequery.composeapp.generated.resources.title_label
import pulsequery.composeapp.generated.resources.widget_saved_to_dashboard_success

/**
 * Target destination when saving a SQL query from [EditorScreen].
 */
enum class SaveQueryDestination {
    /** Save directly onto an existing dashboard as a SQL widget. */
    DASHBOARD_WIDGET,

    /** Register as a reusable template in the Template Library. */
    TEMPLATE
}

/**
 * Immutable UI state for [SaveQueryDialog].
 *
 * @property destination Selected [SaveQueryDestination].
 * @property title Widget or template title string.
 * @property category Template category name when saving as a template.
 * @property description Template description when saving as a template.
 * @property visualization Selected visualization type when saving as a dashboard widget.
 * @property dashboards Available user dashboards loaded from the backend.
 * @property selectedDashboardId Selected target dashboard ID.
 * @property isLoadingDashboards Whether available dashboards are currently being fetched.
 * @property isSaving Whether a save request is currently in flight.
 * @property error Optional validation or submission error message.
 */
data class SaveQueryDialogUiState(
    val destination: SaveQueryDestination = SaveQueryDestination.DASHBOARD_WIDGET,
    val title: String = "",
    val category: String = "Clinical",
    val description: String = "",
    val visualization: String = "table",
    val dashboards: List<DashboardResponse> = emptyList(),
    val selectedDashboardId: String? = null,
    val isLoadingDashboards: Boolean = true,
    val isSaving: Boolean = false,
    val error: String? = null
)

/**
 * Localized validation and confirmation messages used by [SaveQueryDialogStateHolder.submit].
 *
 * @property titleRequiredMessage Localized validation error when title is blank.
 * @property dashboardRequiredMessage Localized validation error when no target dashboard is selected.
 * @property widgetSuccessMessage Localized confirmation message when saving a dashboard widget.
 * @property templateSuccessMessage Localized confirmation message when registering a template.
 */
data class LocalizedSaveMessages(
    val titleRequiredMessage: String = "Title is required",
    val dashboardRequiredMessage: String = "Target dashboard is required",
    val widgetSuccessMessage: String = UiErrorKey.WIDGET_SAVED_SUCCESS.fallbackMessage,
    val templateSuccessMessage: String = UiErrorKey.TEMPLATE_REGISTERED_SUCCESS.fallbackMessage
)

/**
 * State holder managing dashboard loading, form validation, and persistence for [SaveQueryDialog].
 *
 * @property sql Raw SQL query string to persist.
 * @property scope Coroutine scope used for asynchronous operations.
 * @property editorViewModel Backing [EditorViewModel] executing API calls.
 */
class SaveQueryDialogStateHolder(
    private val sql: String,
    private val scope: CoroutineScope,
    private val editorViewModel: EditorViewModel = EditorViewModel(scope = scope)
) {
    private val _state = MutableStateFlow(SaveQueryDialogUiState())

    /** Reactive [StateFlow] of the current [SaveQueryDialogUiState]. */
    val state: StateFlow<SaveQueryDialogUiState> = _state.asStateFlow()

    /**
     * Updates the selected [SaveQueryDestination] and clears any active error.
     *
     * @param destination Target [SaveQueryDestination].
     */
    fun updateDestination(destination: SaveQueryDestination) {
        _state.update { it.copy(destination = destination, error = null) }
    }

    /**
     * Updates the widget or template title and clears any active error.
     *
     * @param title Updated title string.
     */
    fun updateTitle(title: String) {
        _state.update { it.copy(title = title, error = null) }
    }

    /**
     * Updates the template category string.
     *
     * @param category Updated category string.
     */
    fun updateCategory(category: String) {
        _state.update { it.copy(category = category) }
    }

    /**
     * Updates the template description string.
     *
     * @param description Updated description string.
     */
    fun updateDescription(description: String) {
        _state.update { it.copy(description = description) }
    }

    /**
     * Updates the selected visualization type.
     *
     * @param visualization Visualization identifier (e.g. `"table"`, `"bar_chart"`).
     */
    fun updateVisualization(visualization: String) {
        _state.update { it.copy(visualization = visualization) }
    }

    /**
     * Updates the selected target dashboard ID and clears any active error.
     *
     * @param dashboardId Selected dashboard UUID.
     */
    fun selectDashboard(dashboardId: String) {
        _state.update { it.copy(selectedDashboardId = dashboardId, error = null) }
    }

    /**
     * Loads available dashboards from [editorViewModel] on [scope].
     */
    fun loadDashboards() {
        scope.launch {
            performLoadDashboards()
        }
    }

    /**
     * Executes the suspending retrieval of available dashboards from [editorViewModel].
     */
    suspend fun performLoadDashboards() {
        _state.update { it.copy(isLoadingDashboards = true) }
        editorViewModel.loadAvailableDashboards().onSuccess { fetched ->
            _state.update {
                it.copy(
                    dashboards = fetched,
                    selectedDashboardId = fetched.firstOrNull()?.id,
                    isLoadingDashboards = false
                )
            }
        }.onFailure {
            _state.update { it.copy(isLoadingDashboards = false) }
        }
    }

    /**
     * Validates form inputs and submits the save request via [editorViewModel].
     *
     * @param messages Localized validation and confirmation strings.
     * @param onSaved Callback invoked with the confirmation message when saving succeeds.
     */
    fun submit(
        messages: LocalizedSaveMessages = LocalizedSaveMessages(),
        onSaved: (String) -> Unit
    ) {
        val current = _state.value
        if (current.title.isBlank()) {
            _state.update { it.copy(error = messages.titleRequiredMessage) }
            return
        }
        if (current.destination == SaveQueryDestination.DASHBOARD_WIDGET && current.selectedDashboardId == null) {
            _state.update { it.copy(error = messages.dashboardRequiredMessage) }
            return
        }

        scope.launch {
            _state.update { it.copy(isSaving = true, error = null) }
            editorViewModel.saveQuery(
                SaveQueryCommand(
                    destination = current.destination,
                    title = current.title,
                    sql = sql,
                    dashboardId = current.selectedDashboardId,
                    visualization = current.visualization,
                    category = current.category,
                    description = current.description,
                    widgetSuccessMessage = messages.widgetSuccessMessage,
                    templateSuccessMessage = messages.templateSuccessMessage
                )
            ).fold(
                onSuccess = { msg ->
                    _state.update { it.copy(isSaving = false, error = null) }
                    onSaved(msg)
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isSaving = false,
                            error = e.messageOrDefault(UiErrorKey.SAVE_QUERY_FAILED)
                        )
                    }
                }
            )
        }
    }
}

/**
 * Resolves the active [SaveQueryDialogStateHolder], returning [stateHolder] when provided or creating a scoped instance.
 *
 * @param sql Raw SQL query string.
 * @param stateHolder Optional caller-supplied [SaveQueryDialogStateHolder].
 * @param scope CoroutineScope used when constructing a default [EditorViewModel].
 * @param viewModel Optional [EditorViewModel] override.
 * @return Active [SaveQueryDialogStateHolder] instance.
 */
internal fun resolveSaveQueryStateHolder(
    sql: String,
    stateHolder: SaveQueryDialogStateHolder?,
    scope: CoroutineScope,
    viewModel: EditorViewModel?
): SaveQueryDialogStateHolder {
    if (stateHolder != null) return stateHolder
    val resolvedVm = viewModel ?: EditorViewModel(scope = scope)
    return SaveQueryDialogStateHolder(sql = sql, scope = scope, editorViewModel = resolvedVm)
}

/**
 * Resolves the display label for the dashboard selection button in [SaveQueryDialog].
 *
 * @param dashboards Available dashboards.
 * @param selectedDashboardId Selected dashboard ID.
 * @param isLoadingDashboards Whether dashboards are currently loading.
 * @param selectPrompt Localized prompt when no dashboard is selected.
 * @param loadingPrompt Localized prompt while dashboards are loading.
 * @return Resolved button label string.
 */
internal fun resolveSelectedDashboardLabel(
    dashboards: List<DashboardResponse>,
    selectedDashboardId: String?,
    isLoadingDashboards: Boolean,
    selectPrompt: String = "Select Target Dashboard",
    loadingPrompt: String = "Loading dashboards..."
): String {
    val selectedName = dashboards.find { it.id == selectedDashboardId }?.name
    return selectedName ?: if (isLoadingDashboards) loadingPrompt else selectPrompt
}

/**
 * Dialog allowing clinicians to save the current SQL query as either a Dashboard Widget
 * or a reusable Template in the Template Library.
 *
 * @param sql Raw SQL query string to persist.
 * @param onDismiss Callback invoked when the dialog is dismissed.
 * @param onSaved Callback invoked with a confirmation message when saving succeeds.
 * @param viewModel Optional [EditorViewModel] override for testing.
 * @param stateHolder Optional [SaveQueryDialogStateHolder] override for testing.
 */
@Composable
fun SaveQueryDialog(
    sql: String,
    onDismiss: () -> Unit,
    onSaved: (String) -> Unit,
    viewModel: EditorViewModel? = null,
    stateHolder: SaveQueryDialogStateHolder? = null
) {
    val scope = rememberCoroutineScope()
    val holder = remember(sql, viewModel, stateHolder) {
        resolveSaveQueryStateHolder(sql, stateHolder, scope, viewModel)
    }
    val state by holder.state.collectAsState()

    var dashboardMenuExpanded by remember { mutableStateOf(false) }
    var vizMenuExpanded by remember { mutableStateOf(false) }
    val visualizations = listOf("table", "bar_chart", "line_chart", "metric", "pie")

    val widgetSuccessMsg = stringResource(Res.string.widget_saved_to_dashboard_success)
    val templateSuccessMsg = stringResource(Res.string.template_registered_success)
    val titleRequiredMsg = stringResource(Res.string.save_query_title_required)
    val dashboardRequiredMsg = stringResource(Res.string.save_query_dashboard_required)

    LaunchedEffect(holder) {
        holder.performLoadDashboards()
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = stringResource(Res.string.save_analytical_query),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = state.destination == SaveQueryDestination.DASHBOARD_WIDGET,
                        onClick = { holder.updateDestination(SaveQueryDestination.DASHBOARD_WIDGET) },
                        label = { Text(stringResource(Res.string.dashboard_widget_dest)) }
                    )
                    FilterChip(
                        selected = state.destination == SaveQueryDestination.TEMPLATE,
                        onClick = { holder.updateDestination(SaveQueryDestination.TEMPLATE) },
                        label = { Text(stringResource(Res.string.template_library_dest)) }
                    )
                }

                OutlinedTextField(
                    value = state.title,
                    onValueChange = { holder.updateTitle(it) },
                    label = { Text(stringResource(Res.string.title_label)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                if (state.destination == SaveQueryDestination.DASHBOARD_WIDGET) {
                    val dashboardButtonLabel = resolveSelectedDashboardLabel(
                        dashboards = state.dashboards,
                        selectedDashboardId = state.selectedDashboardId,
                        isLoadingDashboards = state.isLoadingDashboards,
                        selectPrompt = stringResource(Res.string.save_query_select_target_dashboard),
                        loadingPrompt = stringResource(Res.string.save_query_loading_dashboards)
                    )
                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { dashboardMenuExpanded = true },
                            enabled = state.dashboards.isNotEmpty(),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = dashboardButtonLabel,
                                modifier = Modifier.weight(1f)
                            )
                            Icon(
                                Icons.Default.ArrowDropDown,
                                contentDescription = stringResource(Res.string.save_query_expand_dashboard_desc)
                            )
                        }
                        DropdownMenu(
                            expanded = dashboardMenuExpanded,
                            onDismissRequest = { dashboardMenuExpanded = false }
                        ) {
                            state.dashboards.forEach { dash ->
                                DropdownMenuItem(
                                    text = { Text(dash.name) },
                                    onClick = {
                                        holder.selectDashboard(dash.id)
                                        dashboardMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    Box(modifier = Modifier.fillMaxWidth()) {
                        OutlinedButton(
                            onClick = { vizMenuExpanded = true },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = stringResource(Res.string.save_query_visualization_fmt, state.visualization),
                                modifier = Modifier.weight(1f)
                            )
                            Icon(
                                Icons.Default.ArrowDropDown,
                                contentDescription = stringResource(Res.string.save_query_expand_visualization_desc)
                            )
                        }
                        DropdownMenu(
                            expanded = vizMenuExpanded,
                            onDismissRequest = { vizMenuExpanded = false }
                        ) {
                            visualizations.forEach { viz ->
                                DropdownMenuItem(
                                    text = { Text(viz) },
                                    onClick = {
                                        holder.updateVisualization(viz)
                                        vizMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                } else {
                    OutlinedTextField(
                        value = state.category,
                        onValueChange = { holder.updateCategory(it) },
                        label = { Text(stringResource(Res.string.category_label)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = state.description,
                        onValueChange = { holder.updateDescription(it) },
                        label = { Text(stringResource(Res.string.description_label)) },
                        minLines = 2,
                        maxLines = 4,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                state.error?.let { err ->
                    Text(
                        text = err,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
                    )
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !state.isSaving,
                onClick = {
                    holder.submit(
                        messages = LocalizedSaveMessages(
                            titleRequiredMessage = titleRequiredMsg,
                            dashboardRequiredMessage = dashboardRequiredMsg,
                            widgetSuccessMessage = widgetSuccessMsg,
                            templateSuccessMessage = templateSuccessMsg
                        ),
                        onSaved = onSaved
                    )
                }
            ) {
                SaveQueryConfirmButtonContent(isSaving = state.isSaving)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !state.isSaving) {
                Text(stringResource(Res.string.cancel))
            }
        }
    )
}

/**
 * Renders the interior progress indicator and label for the Save button in [SaveQueryDialog].
 *
 * @param isSaving Whether a save request is currently in progress.
 */
@Composable
internal fun SaveQueryConfirmButtonContent(isSaving: Boolean) {
    if (isSaving) {
        CircularProgressIndicator(
            modifier = Modifier.size(16.dp),
            strokeWidth = 2.dp
        )
        Spacer(modifier = Modifier.width(8.dp))
    }
    Text(stringResource(Res.string.save))
}
