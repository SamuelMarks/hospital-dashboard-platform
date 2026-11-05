/**
 * Component for rendering the DashboardScreen.
 * Provides the main user interface for this screen with full multi-modal widget lifecycle,
 * reordering, global filtering, undo/redo, and collaboration delegated to [DashboardViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.SystemHealthResponse
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.core.model.VisualizationType
import io.healthplatform.pulsequery.core.model.extractWidgetSqlConfig
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.CollaboratorPresence
import io.healthplatform.pulsequery.saveFileToDevice
import io.healthplatform.pulsequery.ui.components.DashboardGridSkeleton
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import io.healthplatform.pulsequery.ui.components.FilterRibbon
import io.healthplatform.pulsequery.ui.components.WidgetSkeletonPlaceholder
import io.healthplatform.pulsequery.ui.components.cart.QueryCartBottomSheet
import io.healthplatform.pulsequery.ui.components.charts.BarChart
import io.healthplatform.pulsequery.ui.components.charts.HeatmapChart
import io.healthplatform.pulsequery.ui.components.charts.LineChart
import io.healthplatform.pulsequery.ui.components.charts.MetricCard
import io.healthplatform.pulsequery.ui.components.charts.MultiColumnTableView
import io.healthplatform.pulsequery.ui.components.charts.PieChart
import io.healthplatform.pulsequery.ui.components.charts.TableView
import io.healthplatform.pulsequery.ui.components.charts.TextMarkdownWidget
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardExportHelper
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardShareDialog
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardUiState
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardViewModel
import io.healthplatform.pulsequery.ui.screens.dashboard.EditWidgetDialog
import io.healthplatform.pulsequery.ui.screens.dashboard.WidgetRenderState
import io.healthplatform.pulsequery.ui.screens.dashboard.extractWidgetSubtitle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.add_widget
import pulsequery.composeapp.generated.resources.add_widget_prompt_subtitle
import pulsequery.composeapp.generated.resources.add_widget_prompt_title
import pulsequery.composeapp.generated.resources.browse_template_marketplace
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.create
import pulsequery.composeapp.generated.resources.create_dashboard
import pulsequery.composeapp.generated.resources.create_new_dashboard
import pulsequery.composeapp.generated.resources.dashboard_is_empty
import pulsequery.composeapp.generated.resources.dashboard_name
import pulsequery.composeapp.generated.resources.dashboards
import pulsequery.composeapp.generated.resources.database_default_error
import pulsequery.composeapp.generated.resources.database_misconfiguration
import pulsequery.composeapp.generated.resources.delete_dashboard
import pulsequery.composeapp.generated.resources.delete_widget
import pulsequery.composeapp.generated.resources.edit_widget
import pulsequery.composeapp.generated.resources.error
import pulsequery.composeapp.generated.resources.export_csv_failed
import pulsequery.composeapp.generated.resources.export_csv_snapshot
import pulsequery.composeapp.generated.resources.export_dashboard
import pulsequery.composeapp.generated.resources.export_json_failed
import pulsequery.composeapp.generated.resources.export_json_snapshot
import pulsequery.composeapp.generated.resources.export_pdf_failed
import pulsequery.composeapp.generated.resources.export_pdf_report
import pulsequery.composeapp.generated.resources.failed_to_create_dashboard
import pulsequery.composeapp.generated.resources.failed_to_delete_dashboard
import pulsequery.composeapp.generated.resources.failed_to_delete_widget
import pulsequery.composeapp.generated.resources.failed_to_load_dashboards
import pulsequery.composeapp.generated.resources.generated_sql_label
import pulsequery.composeapp.generated.resources.move_down
import pulsequery.composeapp.generated.resources.move_up
import pulsequery.composeapp.generated.resources.natural_text_placeholder_default
import pulsequery.composeapp.generated.resources.no_dashboards_found
import pulsequery.composeapp.generated.resources.no_data_returned_for_query
import pulsequery.composeapp.generated.resources.offline_snapshot_mode
import pulsequery.composeapp.generated.resources.processor_sql_no_model
import pulsequery.composeapp.generated.resources.query_cart
import pulsequery.composeapp.generated.resources.redo
import pulsequery.composeapp.generated.resources.retry
import pulsequery.composeapp.generated.resources.run_natural_text_button
import pulsequery.composeapp.generated.resources.select_dashboard
import pulsequery.composeapp.generated.resources.share_dashboard
import pulsequery.composeapp.generated.resources.source_custom_sql
import pulsequery.composeapp.generated.resources.sql_input_placeholder_default
import pulsequery.composeapp.generated.resources.undo

/**
 * Resolves the active [DashboardViewModel], returning [viewModel] when provided or creating a scoped instance.
 *
 * @param viewModel Optional caller-supplied [DashboardViewModel].
 * @param scope CoroutineScope used when constructing a default [DashboardViewModel].
 * @return Active [DashboardViewModel] instance.
 */
internal fun resolveDashboardViewModel(
    viewModel: DashboardViewModel?,
    scope: CoroutineScope
): DashboardViewModel {
    return viewModel ?: DashboardViewModel(scope = scope)
}

/**
 * Resolves the diagnostic database error message from [SystemHealthResponse], falling back to [defaultError].
 *
 * @param healthState Optional system health payload.
 * @param defaultError Localized fallback error string.
 * @return Specific database error string or [defaultError].
 */
internal fun resolveDashboardDatabaseErrorMessage(
    healthState: SystemHealthResponse?,
    defaultError: String
): String {
    if (healthState == null) return defaultError
    return healthState.duckdb.error ?: healthState.postgres.error ?: defaultError
}

/**
 * Invokes [onAddWidget] with [dashboardId] when the callback is non-null.
 *
 * @param onAddWidget Optional callback for navigating to the widget creation wizard.
 * @param dashboardId Active dashboard ID.
 */
internal fun invokeAddWidgetCallback(
    onAddWidget: ((String) -> Unit)?,
    dashboardId: String
) {
    if (onAddWidget != null) {
        onAddWidget(dashboardId)
    }
}

/**
 * Submits a dashboard creation request to [vm] when [newName] is non-blank.
 *
 * @param newName Candidate dashboard name.
 * @param vm Target [DashboardViewModel].
 * @param errorPrefix Localized error message prefix.
 */
internal fun submitCreateDashboardIfValid(
    newName: String,
    vm: DashboardViewModel,
    errorPrefix: String
) {
    if (newName.isNotBlank()) {
        vm.createDashboard(newName, errorPrefix)
    }
}

/**
 * Resolves the initial natural-text prompt for a widget card, preferring [renderPrompt] when non-blank.
 *
 * @param renderPrompt Active render state prompt.
 * @param configPrompt Fallback prompt stored in widget configuration.
 * @return Initial prompt string.
 */
internal fun resolveWidgetNaturalTextInitialPrompt(
    renderPrompt: String,
    configPrompt: String
): String {
    return renderPrompt.ifBlank { configPrompt }
}

/**
 * Looks up the [WidgetRenderState] for [widgetId] in [widgetDataMap], falling back to a default instance.
 *
 * @param widgetDataMap Map of widget IDs to [WidgetRenderState].
 * @param widgetId Target widget ID.
 * @return Resolved [WidgetRenderState].
 */
internal fun resolveWidgetRenderState(
    widgetDataMap: Map<String, WidgetRenderState>,
    widgetId: String
): WidgetRenderState {
    return widgetDataMap[widgetId] ?: WidgetRenderState()
}

/**
 * Formats key-value float pairs into a semicolon-delimited markdown summary string.
 *
 * @param data List of `(label, value)` pairs.
 * @return Formatted string.
 */
internal fun formatMarkdownPairsContent(data: List<Pair<String, Float>>): String {
    return data.joinToString("; ") { "${it.first}: ${it.second}" }
}

/**
 * Resolves the export failure message, falling back to [fallbackErrorMsg] when [errorMessage] is null.
 *
 * @param errorMessage Exception message or null.
 * @param fallbackErrorMsg Localized fallback error string.
 * @return Non-null error message string.
 */
internal fun resolveExportErrorMessage(
    errorMessage: String?,
    fallbackErrorMsg: String
): String {
    return errorMessage ?: fallbackErrorMsg
}

/**
 * Immutable presentation model bundling a [WidgetResponse], its [WidgetRenderState], and callbacks
 * for rendering inside [LazyVerticalGrid] without capturing outer scope state in the grid item lambda.
 *
 * @property widget Target [WidgetResponse].
 * @property renderState Parsed [WidgetRenderState].
 * @property canMoveUp Whether the widget can move earlier in display order.
 * @property canMoveDown Whether the widget can move later in display order.
 * @property onMoveUp Callback to move the widget up.
 * @property onMoveDown Callback to move the widget down.
 * @property onEdit Callback to open the edit dialog for the widget.
 * @property onDelete Callback to delete the widget.
 * @property onExecuteNaturalText Callback to execute natural text or SQL for the widget.
 */
internal data class DashboardGridWidgetItemModel(
    val widget: WidgetResponse,
    val renderState: WidgetRenderState,
    val canMoveUp: Boolean,
    val canMoveDown: Boolean,
    val onMoveUp: () -> Unit,
    val onMoveDown: () -> Unit,
    val onEdit: () -> Unit,
    val onDelete: () -> Unit,
    val onExecuteNaturalText: (String) -> Unit
)

/**
 * Maps an ordered list of [WidgetResponse] models into [DashboardGridWidgetItemModel] items for [LazyVerticalGrid].
 *
 * @param widgetDataMap Map of widget IDs to [WidgetRenderState].
 * @param onReorderWidget Callback invoked with `(fromIndex, toIndex)`.
 * @param onEditWidget Callback invoked to edit a widget.
 * @param onDeleteWidget Callback invoked to delete a widget.
 * @param onExecuteWidgetNaturalText Callback invoked with `(widgetId, text)`.
 * @return Ordered list of [DashboardGridWidgetItemModel] instances.
 */
internal fun List<WidgetResponse>.toDashboardGridWidgetItems(
    widgetDataMap: Map<String, WidgetRenderState>,
    onReorderWidget: (Int, Int) -> Unit,
    onEditWidget: (WidgetResponse) -> Unit,
    onDeleteWidget: (WidgetResponse) -> Unit,
    onExecuteWidgetNaturalText: (String, String) -> Unit
): List<DashboardGridWidgetItemModel> {
    return mapIndexed { index, widget ->
        DashboardGridWidgetItemModel(
            widget = widget,
            renderState = resolveWidgetRenderState(widgetDataMap, widget.id),
            canMoveUp = index > 0,
            canMoveDown = index < size - 1,
            onMoveUp = { onReorderWidget(index, index - 1) },
            onMoveDown = { onReorderWidget(index, index + 1) },
            onEdit = { onEditWidget(widget) },
            onDelete = { onDeleteWidget(widget) },
            onExecuteNaturalText = { text -> onExecuteWidgetNaturalText(widget.id, text) }
        )
    }
}

/**
 * Executes a dashboard export format (`pdf`, `csv`, or `json`), persists the exported artifact
 * locally and to device storage via [deviceSaver], and returns the resulting snackbar status message.
 *
 * @param dashboardId Target dashboard ID.
 * @param format Export format (`pdf`, `csv`, or `json`).
 * @param fallbackErrorMsg Localized fallback error string when export fails without a message.
 * @param deviceSaver Function persisting bytes to the device file system.
 * @return Status message to display in the snackbar.
 */
internal suspend fun performDashboardExportAction(
    dashboardId: String,
    format: String,
    fallbackErrorMsg: String,
    deviceSaver: (String, String, ByteArray) -> Result<String> = ::saveFileToDevice
): String {
    val label = format.uppercase()
    val isPdf = format.equals("pdf", ignoreCase = true)
    val exportResult = if (isPdf) {
        DashboardExportHelper.exportDashboardPdf(dashboardId)
    } else {
        DashboardExportHelper.exportDashboard(dashboardId, format)
    }
    return exportResult.fold(
        onSuccess = { artifact ->
            val cachePayload = if (isPdf) "binary_pdf_cached" else artifact.content
            DashboardExportHelper.saveExportedFile(artifact.filename, cachePayload)
            val saveRes = deviceSaver(artifact.filename, artifact.mimeType, artifact.bytes)
            val prefix = if (isPdf) "Report" else label
            if (saveRes.isSuccess) {
                "$prefix saved to ${artifact.filename}"
            } else {
                "$prefix exported locally: ${artifact.filename}"
            }
        },
        onFailure = { err ->
            resolveExportErrorMessage(err.message, fallbackErrorMsg)
        }
    )
}

/**
 * Main application dashboard screen delegating all state and network operations to [DashboardViewModel].
 *
 * @param onAddWidget Optional callback invoked with the active dashboard ID to navigate to the widget creation wizard.
 * @param viewModel Optional [DashboardViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onAddWidget: ((String) -> Unit)? = null,
    viewModel: DashboardViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, coroutineScope) {
        resolveDashboardViewModel(viewModel, coroutineScope)
    }

    val uiState by vm.state.collectAsState()
    val collaborators by vm.collaborators.collectAsState()
    val cartItems by vm.cartItems.collectAsState()
    val canUndo by vm.undoRedoManager.canUndo.collectAsState()
    val canRedo by vm.undoRedoManager.canRedo.collectAsState()

    val isDatabaseHealthy by AppContainer.networkHealthRepository.isDatabaseHealthy.collectAsState()
    val healthState by AppContainer.networkHealthRepository.healthState.collectAsState()

    var showShareDialog by remember { mutableStateOf(false) }
    var showExportMenu by remember { mutableStateOf(false) }
    var showCreateDashboardDialog by remember { mutableStateOf(false) }
    var showDashboardMenu by remember { mutableStateOf(false) }
    var showCartSheet by remember { mutableStateOf(false) }
    var widgetToEdit by remember { mutableStateOf<WidgetResponse?>(null) }

    val snackbarHostState = remember { SnackbarHostState() }

    val errLoadDb = stringResource(Res.string.failed_to_load_dashboards, "")
    val errCreateDb = stringResource(Res.string.failed_to_create_dashboard, "")
    val errDeleteDb = stringResource(Res.string.failed_to_delete_dashboard, "")
    val errDeleteWidget = stringResource(Res.string.failed_to_delete_widget, "")

    DisposableEffect(vm) {
        onDispose {
            vm.onCleared()
        }
    }

    LaunchedEffect(vm) {
        vm.performLoadDashboards(errLoadDb)
    }

    val activeDashboard = uiState.activeDashboard
    val closeDashboardMenu = { showDashboardMenu = false }
    val closeExportMenu = { showExportMenu = false }
    val closeCreateDialog = { showCreateDashboardDialog = false }
    val closeShareDialog = { showShareDialog = false }
    val closeCartSheet = { showCartSheet = false }

    val launchExport: (String, String, String) -> Unit = { dashId, fmt, fallbackErr ->
        closeExportMenu()
        coroutineScope.launch {
            val msg = performDashboardExportAction(dashId, fmt, fallbackErr)
            snackbarHostState.showSnackbar(msg)
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            DashboardTopBar(
                activeDashboard = activeDashboard,
                dashboards = uiState.dashboards,
                showDashboardMenu = showDashboardMenu,
                onOpenDashboardMenu = { showDashboardMenu = true },
                onCloseDashboardMenu = closeDashboardMenu,
                onSelectDashboard = { db ->
                    vm.selectDashboard(db)
                    closeDashboardMenu()
                },
                onOpenCreateDashboard = {
                    showCreateDashboardDialog = true
                    closeDashboardMenu()
                },
                collaborators = collaborators,
                canUndo = canUndo,
                canRedo = canRedo,
                cartItemCount = cartItems.size,
                showExportMenu = showExportMenu,
                onOpenExportMenu = { showExportMenu = true },
                onCloseExportMenu = closeExportMenu,
                onUndo = { vm.undo() },
                onRedo = { vm.redo() },
                onOpenCart = { showCartSheet = true },
                onOpenShare = { showShareDialog = true },
                onExportFormat = launchExport,
                onDeleteDashboard = { dashId -> vm.deleteDashboard(dashId, errDeleteDb) }
            )
        },
        floatingActionButton = {
            DashboardAddWidgetFab(
                activeDashboard = activeDashboard,
                onAddWidget = onAddWidget
            )
        }
    ) { paddingValues ->
        DashboardScreenBody(
            uiState = uiState,
            isDatabaseHealthy = isDatabaseHealthy,
            healthState = healthState,
            paddingValues = paddingValues,
            onRetryDatabase = { vm.retryHealthAndLoad() },
            onRetryLoadDashboards = { vm.loadDashboards(errLoadDb) },
            onOpenCreateDashboard = { showCreateDashboardDialog = true },
            onFiltersChanged = { dept, tr -> vm.updateFilters(dept, tr) },
            onResetFilters = { vm.resetFilters() },
            onAddWidget = onAddWidget,
            onReorderWidget = { fromIdx, toIdx -> vm.reorderWidget(fromIdx, toIdx) },
            onEditWidget = { widgetToEdit = it },
            onDeleteWidget = { vm.deleteWidgetWithUndo(it, errDeleteWidget) },
            onExecuteWidgetNaturalText = { wid, text -> vm.executeWidgetNaturalText(wid, text) }
        )
    }

    DashboardDialogsSection(
        showCreateDashboardDialog = showCreateDashboardDialog,
        onCloseCreateDialog = closeCreateDialog,
        onCreateDashboard = { newName ->
            submitCreateDashboardIfValid(newName, vm, errCreateDb)
            closeCreateDialog()
        },
        showShareDialog = showShareDialog,
        activeDashboard = activeDashboard,
        onCloseShareDialog = closeShareDialog,
        showCartSheet = showCartSheet,
        onCloseCartSheet = closeCartSheet,
        onReloadDashboards = { vm.loadDashboards(errLoadDb) },
        widgetToEdit = widgetToEdit,
        onDismissEditWidget = { widgetToEdit = null },
        onWidgetUpdated = {
            widgetToEdit = null
            vm.loadDashboards(errLoadDb)
        }
    )
}

/**
 * Renders the modal dialogs and bottom sheets associated with [DashboardScreen].
 *
 * @param showCreateDashboardDialog Whether the Create Dashboard dialog is visible.
 * @param onCloseCreateDialog Callback to dismiss the Create Dashboard dialog.
 * @param onCreateDashboard Callback invoked with the new dashboard name.
 * @param showShareDialog Whether the Share Dashboard dialog is visible.
 * @param activeDashboard Active [DashboardResponse] or null.
 * @param onCloseShareDialog Callback to dismiss the Share Dashboard dialog.
 * @param showCartSheet Whether the Query Cart bottom sheet is visible.
 * @param onCloseCartSheet Callback to dismiss the Query Cart bottom sheet.
 * @param onReloadDashboards Callback to reload dashboards after cart deployment.
 * @param widgetToEdit Currently selected [WidgetResponse] for editing, or null.
 * @param onDismissEditWidget Callback to dismiss the Edit Widget dialog.
 * @param onWidgetUpdated Callback invoked after a widget edit is saved.
 */
@Composable
private fun DashboardDialogsSection(
    showCreateDashboardDialog: Boolean,
    onCloseCreateDialog: () -> Unit,
    onCreateDashboard: (String) -> Unit,
    showShareDialog: Boolean,
    activeDashboard: DashboardResponse?,
    onCloseShareDialog: () -> Unit,
    showCartSheet: Boolean,
    onCloseCartSheet: () -> Unit,
    onReloadDashboards: () -> Unit,
    widgetToEdit: WidgetResponse?,
    onDismissEditWidget: () -> Unit,
    onWidgetUpdated: (WidgetResponse) -> Unit
) {
    if (showCreateDashboardDialog) {
        CreateDashboardAlertDialog(
            onDismiss = onCloseCreateDialog,
            onCreate = onCreateDashboard
        )
    }

    if (showShareDialog && activeDashboard != null) {
        DashboardShareDialog(
            dashboardId = activeDashboard.id,
            onDismiss = onCloseShareDialog
        )
    }

    if (showCartSheet) {
        QueryCartBottomSheet(
            activeDashboardId = activeDashboard?.id,
            onDismiss = onCloseCartSheet,
            onQueriesDeployed = onReloadDashboards
        )
    }

    if (widgetToEdit != null) {
        EditWidgetDialog(
            widget = widgetToEdit,
            onDismiss = onDismissEditWidget,
            onWidgetUpdated = onWidgetUpdated
        )
    }
}

/**
 * Renders the top app bar for [DashboardScreen].
 *
 * @param activeDashboard Active [DashboardResponse] or null.
 * @param dashboards Available dashboards list.
 * @param showDashboardMenu Whether the dashboard selector dropdown is expanded.
 * @param onOpenDashboardMenu Callback to expand the dashboard selector menu.
 * @param onCloseDashboardMenu Callback to collapse the dashboard selector menu.
 * @param onSelectDashboard Callback invoked when a dashboard is chosen.
 * @param onOpenCreateDashboard Callback invoked to open the Create Dashboard dialog.
 * @param collaborators Active collaborator list.
 * @param canUndo Whether Undo is available.
 * @param canRedo Whether Redo is available.
 * @param cartItemCount Number of queries staged in the cart.
 * @param showExportMenu Whether the export menu is expanded.
 * @param onOpenExportMenu Callback to expand the export menu.
 * @param onCloseExportMenu Callback to collapse the export menu.
 * @param onUndo Callback invoked when Undo is clicked.
 * @param onRedo Callback invoked when Redo is clicked.
 * @param onOpenCart Callback invoked when Query Cart is clicked.
 * @param onOpenShare Callback invoked when Share Dashboard is clicked.
 * @param onExportFormat Callback invoked with `(dashboardId, format, fallbackError)` when an export item is clicked.
 * @param onDeleteDashboard Callback invoked with `dashboardId` when Delete Dashboard is clicked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DashboardTopBar(
    activeDashboard: DashboardResponse?,
    dashboards: List<DashboardResponse>,
    showDashboardMenu: Boolean,
    onOpenDashboardMenu: () -> Unit,
    onCloseDashboardMenu: () -> Unit,
    onSelectDashboard: (DashboardResponse) -> Unit,
    onOpenCreateDashboard: () -> Unit,
    collaborators: List<CollaboratorPresence>,
    canUndo: Boolean,
    canRedo: Boolean,
    cartItemCount: Int,
    showExportMenu: Boolean,
    onOpenExportMenu: () -> Unit,
    onCloseExportMenu: () -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onOpenCart: () -> Unit,
    onOpenShare: () -> Unit,
    onExportFormat: (String, String, String) -> Unit,
    onDeleteDashboard: (String) -> Unit
) {
    TopAppBar(
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(activeDashboard?.name ?: stringResource(Res.string.dashboards))
                if (dashboards.isNotEmpty()) {
                    IconButton(onClick = onOpenDashboardMenu) {
                        Icon(Icons.Default.ArrowDropDown, contentDescription = stringResource(Res.string.select_dashboard))
                    }
                    DropdownMenu(expanded = showDashboardMenu, onDismissRequest = onCloseDashboardMenu) {
                        dashboards.forEach { db ->
                            DropdownMenuItem(
                                text = { Text(db.name) },
                                onClick = { onSelectDashboard(db) }
                            )
                        }
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text(stringResource(Res.string.create_new_dashboard)) },
                            onClick = onOpenCreateDashboard
                        )
                    }
                }
            }
        },
        actions = {
            DashboardTopBarActions(
                activeDashboard = activeDashboard,
                collaborators = collaborators,
                canUndo = canUndo,
                canRedo = canRedo,
                cartItemCount = cartItemCount,
                showExportMenu = showExportMenu,
                onOpenExportMenu = onOpenExportMenu,
                onCloseExportMenu = onCloseExportMenu,
                onUndo = onUndo,
                onRedo = onRedo,
                onOpenCart = onOpenCart,
                onOpenShare = onOpenShare,
                onExportFormat = onExportFormat,
                onDeleteDashboard = onDeleteDashboard
            )
        }
    )
}

/**
 * Renders the action icons and collaborator presence avatars inside [DashboardTopBar].
 *
 * @param activeDashboard Active [DashboardResponse] or null.
 * @param collaborators Active collaborator list.
 * @param canUndo Whether Undo is available.
 * @param canRedo Whether Redo is available.
 * @param cartItemCount Number of queries staged in the cart.
 * @param showExportMenu Whether the export menu is expanded.
 * @param onOpenExportMenu Callback to expand the export menu.
 * @param onCloseExportMenu Callback to collapse the export menu.
 * @param onUndo Callback invoked when Undo is clicked.
 * @param onRedo Callback invoked when Redo is clicked.
 * @param onOpenCart Callback invoked when Query Cart is clicked.
 * @param onOpenShare Callback invoked when Share Dashboard is clicked.
 * @param onExportFormat Callback invoked with `(dashboardId, format, fallbackError)` when an export item is clicked.
 * @param onDeleteDashboard Callback invoked with `dashboardId` when Delete Dashboard is clicked.
 */
@Composable
internal fun DashboardTopBarActions(
    activeDashboard: DashboardResponse?,
    collaborators: List<CollaboratorPresence>,
    canUndo: Boolean,
    canRedo: Boolean,
    cartItemCount: Int,
    showExportMenu: Boolean,
    onOpenExportMenu: () -> Unit,
    onCloseExportMenu: () -> Unit,
    onUndo: () -> Unit,
    onRedo: () -> Unit,
    onOpenCart: () -> Unit,
    onOpenShare: () -> Unit,
    onExportFormat: (String, String, String) -> Unit,
    onDeleteDashboard: (String) -> Unit
) {
    if (activeDashboard != null) {
        if (collaborators.isNotEmpty()) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.padding(end = 4.dp)
            ) {
                collaborators.take(3).forEach { user ->
                    CollaboratorPresenceAvatar(user = user)
                }
            }
        }
        IconButton(onClick = onUndo, enabled = canUndo) {
            Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = stringResource(Res.string.undo))
        }
        IconButton(onClick = onRedo, enabled = canRedo) {
            Icon(Icons.AutoMirrored.Filled.Redo, contentDescription = stringResource(Res.string.redo))
        }
        IconButton(onClick = onOpenCart) {
            BadgedBox(
                badge = {
                    if (cartItemCount > 0) {
                        Badge { Text(cartItemCount.toString()) }
                    }
                }
            ) {
                Icon(Icons.AutoMirrored.Filled.List, contentDescription = stringResource(Res.string.query_cart))
            }
        }
        IconButton(onClick = onOpenShare) {
            Icon(Icons.Filled.Share, contentDescription = stringResource(Res.string.share_dashboard))
        }
        Box {
            val errExportPdf = stringResource(Res.string.export_pdf_failed)
            val errExportCsv = stringResource(Res.string.export_csv_failed)
            val errExportJson = stringResource(Res.string.export_json_failed)
            IconButton(onClick = onOpenExportMenu) {
                Icon(Icons.Filled.FileDownload, contentDescription = stringResource(Res.string.export_dashboard))
            }
            DropdownMenu(
                expanded = showExportMenu,
                onDismissRequest = onCloseExportMenu
            ) {
                DropdownMenuItem(
                    text = { Text(stringResource(Res.string.export_pdf_report)) },
                    onClick = { onExportFormat(activeDashboard.id, "pdf", errExportPdf) }
                )
                DropdownMenuItem(
                    text = { Text(stringResource(Res.string.export_csv_snapshot)) },
                    onClick = { onExportFormat(activeDashboard.id, "csv", errExportCsv) }
                )
                DropdownMenuItem(
                    text = { Text(stringResource(Res.string.export_json_snapshot)) },
                    onClick = { onExportFormat(activeDashboard.id, "json", errExportJson) }
                )
            }
        }
        IconButton(onClick = { onDeleteDashboard(activeDashboard.id) }) {
            Icon(Icons.Default.Delete, contentDescription = stringResource(Res.string.delete_dashboard))
        }
    }
}

/**
 * Renders a circular collaborator avatar badge inside [DashboardTopBarActions].
 *
 * @param user Collaborator presence entry.
 */
@Composable
private fun CollaboratorPresenceAvatar(user: CollaboratorPresence) {
    Surface(
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primaryContainer,
        modifier = Modifier.size(22.dp)
    ) {
        CollaboratorAvatarInitial(email = user.email)
    }
}

/**
 * Renders the centered uppercase initial inside [CollaboratorPresenceAvatar].
 *
 * @param email Collaborator email address.
 */
@Composable
private fun CollaboratorAvatarInitial(email: String) {
    Box(contentAlignment = Alignment.Center) {
        Text(
            text = email.take(1).uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}

/**
 * Renders the Add Widget floating action button when an active dashboard is present.
 *
 * @param activeDashboard Active [DashboardResponse] or null.
 * @param onAddWidget Optional callback invoked with the active dashboard ID.
 */
@Composable
private fun DashboardAddWidgetFab(
    activeDashboard: DashboardResponse?,
    onAddWidget: ((String) -> Unit)?
) {
    if (activeDashboard != null) {
        val addWidgetDesc = stringResource(Res.string.add_widget)
        FloatingActionButton(
            onClick = { invokeAddWidgetCallback(onAddWidget, activeDashboard.id) },
            modifier = Modifier.semantics { contentDescription = addWidgetDesc }
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
        }
    }
}

/**
 * Renders the main body of [DashboardScreen].
 *
 * @param uiState Current [DashboardUiState].
 * @param isDatabaseHealthy Whether backend databases are healthy.
 * @param healthState Optional [SystemHealthResponse].
 * @param paddingValues Scaffold inner padding.
 * @param onRetryDatabase Callback invoked when retrying from the database error banner.
 * @param onRetryLoadDashboards Callback invoked when retrying after a dashboard load failure.
 * @param onOpenCreateDashboard Callback invoked to open the Create Dashboard dialog.
 * @param onFiltersChanged Callback invoked when global filters change.
 * @param onResetFilters Callback invoked when global filters are reset.
 * @param onAddWidget Optional callback invoked to add a widget.
 * @param onReorderWidget Callback invoked with `(fromIndex, toIndex)` to reorder widgets.
 * @param onEditWidget Callback invoked to edit a widget.
 * @param onDeleteWidget Callback invoked to delete a widget.
 * @param onExecuteWidgetNaturalText Callback invoked with `(widgetId, text)` to run natural text on a widget.
 */
@Composable
private fun DashboardScreenBody(
    uiState: DashboardUiState,
    isDatabaseHealthy: Boolean,
    healthState: SystemHealthResponse?,
    paddingValues: PaddingValues,
    onRetryDatabase: () -> Unit,
    onRetryLoadDashboards: () -> Unit,
    onOpenCreateDashboard: () -> Unit,
    onFiltersChanged: (String?, String?) -> Unit,
    onResetFilters: () -> Unit,
    onAddWidget: ((String) -> Unit)?,
    onReorderWidget: (Int, Int) -> Unit,
    onEditWidget: (WidgetResponse) -> Unit,
    onDeleteWidget: (WidgetResponse) -> Unit,
    onExecuteWidgetNaturalText: (String, String) -> Unit
) {
    val activeDashboard = uiState.activeDashboard
    Box(modifier = Modifier.fillMaxSize().padding(paddingValues), contentAlignment = Alignment.Center) {
        val currentError = uiState.errorMessage
        when {
            uiState.isLoading -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    DashboardGridSkeleton()
                }
            }
            !isDatabaseHealthy -> {
                val dbMsg = resolveDashboardDatabaseErrorMessage(
                    healthState = healthState,
                    defaultError = stringResource(Res.string.database_default_error)
                )
                DatabaseErrorCard(
                    title = stringResource(Res.string.database_misconfiguration),
                    message = dbMsg,
                    onRetry = onRetryDatabase,
                    modifier = Modifier.padding(16.dp)
                )
            }
            currentError != null -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(text = currentError, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                    Button(onClick = onRetryLoadDashboards) { Text(stringResource(Res.string.retry)) }
                }
            }
            uiState.dashboards.isEmpty() -> {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stringResource(Res.string.no_dashboards_found), style = MaterialTheme.typography.bodyLarge)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onOpenCreateDashboard) {
                        Text(stringResource(Res.string.create_dashboard))
                    }
                }
            }
            activeDashboard != null -> {
                val widgets = activeDashboard.widgets ?: emptyList()
                Column(modifier = Modifier.fillMaxSize()) {
                    FilterRibbon(
                        activeDepartment = uiState.filterDepartment,
                        activeTimeRange = uiState.filterTimeRange,
                        onFiltersChanged = onFiltersChanged,
                        onResetFilters = onResetFilters
                    )

                    if (uiState.isOfflineSnapshot) {
                        Surface(
                            color = MaterialTheme.colorScheme.tertiaryContainer,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = stringResource(Res.string.offline_snapshot_mode),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                                modifier = Modifier.padding(8.dp)
                            )
                        }
                    }

                    if (widgets.isEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically)
                        ) {
                            Text(stringResource(Res.string.dashboard_is_empty))
                            AddWidgetPromptCard(
                                onAddWidget = { invokeAddWidgetCallback(onAddWidget, activeDashboard.id) }
                            )
                        }
                    } else {
                        val gridItems = widgets.toDashboardGridWidgetItems(
                            widgetDataMap = uiState.widgetDataMap,
                            onReorderWidget = onReorderWidget,
                            onEditWidget = onEditWidget,
                            onDeleteWidget = onDeleteWidget,
                            onExecuteWidgetNaturalText = onExecuteWidgetNaturalText
                        )
                        LazyVerticalGrid(
                            columns = GridCells.Adaptive(minSize = 300.dp),
                            contentPadding = PaddingValues(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier.fillMaxSize().testTag("dashboard_grid")
                        ) {
                            items(gridItems) { item ->
                                DashboardGridWidgetCardItem(item = item)
                            }
                            item {
                                DashboardTrailingAddWidgetCtaSection(
                                    showCta = widgets.size < 2,
                                    onAddWidget = { invokeAddWidgetCallback(onAddWidget, activeDashboard.id) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Renders a single [DashboardGridWidgetItemModel] inside [LazyVerticalGrid].
 *
 * @param item Bundled widget item model.
 */
@Composable
private fun DashboardGridWidgetCardItem(item: DashboardGridWidgetItemModel) {
    WidgetElevatedCard(
        widget = item.widget,
        renderState = item.renderState,
        canMoveUp = item.canMoveUp,
        canMoveDown = item.canMoveDown,
        onMoveUp = item.onMoveUp,
        onMoveDown = item.onMoveDown,
        onEdit = item.onEdit,
        onDelete = item.onDelete,
        onExecuteNaturalText = item.onExecuteNaturalText
    )
}

/**
 * Renders the trailing [AddWidgetPromptCard] inside the dashboard grid when fewer than 2 widgets exist.
 *
 * @param showCta Whether the CTA card should be shown.
 * @param onAddWidget Callback invoked when the user clicks to add a widget.
 */
@Composable
private fun DashboardTrailingAddWidgetCtaSection(
    showCta: Boolean,
    onAddWidget: () -> Unit
) {
    if (showCta) {
        AddWidgetPromptCard(onAddWidget = onAddWidget)
    }
}

/**
 * Renders the dialog for creating a new dashboard.
 *
 * @param onDismiss Callback invoked when the dialog is dismissed or cancelled.
 * @param onCreate Callback invoked with the entered dashboard name when Create is clicked.
 */
@Composable
private fun CreateDashboardAlertDialog(
    onDismiss: () -> Unit,
    onCreate: (String) -> Unit
) {
    var newName by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(Res.string.create_dashboard)) },
        text = {
            OutlinedTextField(
                value = newName,
                onValueChange = { newName = it },
                label = { Text(stringResource(Res.string.dashboard_name)) }
            )
        },
        confirmButton = {
            TextButton(onClick = { onCreate(newName) }) { Text(stringResource(Res.string.create)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(Res.string.cancel)) }
        }
    )
}

/**
 * Prominent call-to-action card rendered when a dashboard has fewer than 2 widgets (`0` or `1` widget),
 * making it immediately obvious how to add a new widget from templates or custom SQL/Markdown.
 *
 * @param onAddWidget Callback invoked when the user clicks to add a widget.
 * @param modifier Optional [Modifier] applied to the card.
 */
@Composable
fun AddWidgetPromptCard(
    onAddWidget: () -> Unit,
    modifier: Modifier = Modifier
) {
    val promptTitle = stringResource(Res.string.add_widget_prompt_title)
    val promptSubtitle = stringResource(Res.string.add_widget_prompt_subtitle)
    OutlinedCard(
        modifier = modifier
            .fillMaxWidth()
            .testTag("add_widget_cta_card")
            .semantics { contentDescription = promptTitle },
        colors = CardDefaults.outlinedCardColors(
            containerColor = MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Add,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(32.dp)
            )
            Text(
                text = promptTitle,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )
            Text(
                text = promptSubtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Button(
                    onClick = onAddWidget,
                    modifier = Modifier.testTag("cta_browse_templates_btn")
                ) {
                    Text(stringResource(Res.string.browse_template_marketplace))
                }
                OutlinedButton(
                    onClick = onAddWidget,
                    modifier = Modifier.testTag("cta_custom_sql_btn")
                ) {
                    Text(stringResource(Res.string.source_custom_sql))
                }
            }
        }
    }
}

/**
 * Stateless card container rendering an analytical widget with header controls for editing, reordering, and deletion,
 * plus an interactive natural-text / SQL execution bar when `allow_natural_text` is enabled.
 *
 * @param widget The [WidgetResponse] data model to render.
 * @param renderState Parsed [WidgetRenderState] produced by [DashboardViewModel].
 * @param canMoveUp Whether this widget can be shifted earlier in the display order.
 * @param canMoveDown Whether this widget can be shifted later in the display order.
 * @param onMoveUp Callback to move the widget upward.
 * @param onMoveDown Callback to move the widget downward.
 * @param onEdit Callback to initiate in-place editing of widget configurations.
 * @param onDelete Callback to delete the widget.
 * @param onExecuteNaturalText Callback invoked when the user submits natural text or SQL inside the widget.
 */
@Composable
fun WidgetElevatedCard(
    widget: WidgetResponse,
    renderState: WidgetRenderState = WidgetRenderState(),
    canMoveUp: Boolean = false,
    canMoveDown: Boolean = false,
    onMoveUp: () -> Unit = {},
    onMoveDown: () -> Unit = {},
    onEdit: () -> Unit = {},
    onDelete: () -> Unit = {},
    onExecuteNaturalText: (String) -> Unit = {}
) {
    val sqlCfg = extractWidgetSqlConfig(widget.config)
    val allowNaturalText = renderState.allowNaturalText || sqlCfg.allowNaturalText
    val cfgProcessor = if (sqlCfg.processor.value != "SQL") {
        sqlCfg.processor.value
    } else {
        renderState.processor.value
    }
    val cfgPrompt = sqlCfg.naturalTextPrompt
    val subtitle = extractWidgetSubtitle(widget)
    var naturalInput by remember(widget.id, renderState.naturalTextPrompt, cfgPrompt) {
        mutableStateOf(resolveWidgetNaturalTextInitialPrompt(renderState.naturalTextPrompt, cfgPrompt))
    }

    ElevatedCard(
        modifier = Modifier.fillMaxWidth().height(if (allowNaturalText) 390.dp else 330.dp),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = widget.title,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1
                    )
                    if (!subtitle.isNullOrBlank()) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 2,
                            modifier = Modifier.testTag("widget_subtitle_${widget.id}")
                        )
                    }
                    if (allowNaturalText) {
                        val procLabel = if (cfgProcessor.equals("SQL", ignoreCase = true)) {
                            stringResource(Res.string.processor_sql_no_model)
                        } else {
                            cfgProcessor
                        }
                        Text(
                            text = procLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                        Icon(Icons.Default.ArrowUpward, contentDescription = stringResource(Res.string.move_up))
                    }
                    IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = stringResource(Res.string.move_down))
                    }
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Default.Edit, contentDescription = stringResource(Res.string.edit_widget))
                    }
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, contentDescription = stringResource(Res.string.delete_widget))
                    }
                }
            }
            if (allowNaturalText) {
                Spacer(modifier = Modifier.height(6.dp))
                val defaultHint = if (cfgProcessor.equals("SQL", ignoreCase = true)) {
                    stringResource(Res.string.sql_input_placeholder_default)
                } else {
                    stringResource(Res.string.natural_text_placeholder_default)
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = naturalInput,
                        onValueChange = { naturalInput = it },
                        placeholder = { Text(defaultHint, style = MaterialTheme.typography.bodySmall) },
                        singleLine = true,
                        modifier = Modifier
                            .weight(1f)
                            .testTag("widget_natural_text_input_${widget.id}")
                            .semantics { contentDescription = defaultHint }
                    )
                    Button(
                        onClick = { onExecuteNaturalText(naturalInput) },
                        enabled = !renderState.isExecutingNaturalText && naturalInput.isNotBlank(),
                        modifier = Modifier.testTag("widget_natural_text_run_${widget.id}")
                    ) {
                        Text(stringResource(Res.string.run_natural_text_button))
                    }
                }
                val generatedSql = renderState.generatedSql
                if (!generatedSql.isNullOrBlank() && !renderState.processor.isDirectSql) {
                    Text(
                        text = stringResource(Res.string.generated_sql_label, generatedSql),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f))
            Spacer(modifier = Modifier.height(8.dp))
            WidgetContent(widget = widget, renderState = renderState)
        }
    }
}

/**
 * Stateless renderer for a widget's visualization (charts, tables, or markdown notes)
 * based on the widget's type, visualization schema, and pre-parsed [renderState].
 *
 * @param widget The [WidgetResponse] metadata model.
 * @param renderState The [WidgetRenderState] containing parsed data rows, columns, text, or error.
 */
@Composable
fun WidgetContent(
    widget: WidgetResponse,
    renderState: WidgetRenderState = WidgetRenderState()
) {
    val errText = renderState.errorMessage
    val textContent = renderState.textContent
    val data = renderState.data
    val tableColumns = renderState.tableColumns
    val tableRows = renderState.tableRows

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        when {
            renderState.isExecutingNaturalText -> {
                WidgetSkeletonPlaceholder(
                    visualization = VisualizationType.fromWire(widget.visualization)
                )
            }
            errText != null -> {
                val errorTxt = stringResource(Res.string.error, errText)
                Text(text = errorTxt, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            textContent != null -> {
                TextMarkdownWidget(content = textContent)
            }
            data.isEmpty() && tableRows.isEmpty() -> {
                Text(
                    text = stringResource(Res.string.no_data_returned_for_query),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            else -> {
                when (VisualizationType.fromWire(widget.visualization)) {
                    VisualizationType.BAR_CHART -> BarChart(data = data)
                    VisualizationType.LINE_CHART -> LineChart(data = data)
                    VisualizationType.PIE_CHART -> PieChart(data = data)
                    VisualizationType.METRIC, VisualizationType.SCALAR -> MetricCard(data = data)
                    VisualizationType.HEATMAP -> HeatmapChart(columns = tableColumns, rows = tableRows)
                    VisualizationType.MARKDOWN -> TextMarkdownWidget(content = formatMarkdownPairsContent(data))
                    VisualizationType.TABLE -> {
                        if (tableColumns.size > 2) {
                            MultiColumnTableView(columns = tableColumns, rows = tableRows)
                        } else {
                            TableView(data = data)
                        }
                    }
                }
            }
        }
    }
}
