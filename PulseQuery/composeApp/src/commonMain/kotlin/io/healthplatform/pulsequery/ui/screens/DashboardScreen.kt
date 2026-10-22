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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
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
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.saveFileToDevice
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import io.healthplatform.pulsequery.ui.components.FilterRibbon
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
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardViewModel
import io.healthplatform.pulsequery.ui.screens.dashboard.EditWidgetDialog
import io.healthplatform.pulsequery.ui.screens.dashboard.WidgetRenderState
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.create
import pulsequery.composeapp.generated.resources.create_dashboard
import pulsequery.composeapp.generated.resources.create_new_dashboard
import pulsequery.composeapp.generated.resources.dashboard_is_empty
import pulsequery.composeapp.generated.resources.dashboard_name
import pulsequery.composeapp.generated.resources.dashboards
import pulsequery.composeapp.generated.resources.delete_dashboard
import pulsequery.composeapp.generated.resources.delete_widget
import pulsequery.composeapp.generated.resources.error
import pulsequery.composeapp.generated.resources.failed_to_create_dashboard
import pulsequery.composeapp.generated.resources.failed_to_delete_dashboard
import pulsequery.composeapp.generated.resources.failed_to_delete_widget
import pulsequery.composeapp.generated.resources.failed_to_load_dashboards
import pulsequery.composeapp.generated.resources.no_dashboards_found
import pulsequery.composeapp.generated.resources.retry
import pulsequery.composeapp.generated.resources.select_dashboard

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
    val vm = remember(viewModel) { viewModel ?: DashboardViewModel(scope = coroutineScope) }

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
        vm.loadDashboards(errLoadDb)
    }

    val activeDashboard = uiState.activeDashboard

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(activeDashboard?.name ?: stringResource(Res.string.dashboards))
                        if (uiState.dashboards.isNotEmpty()) {
                            IconButton(onClick = { showDashboardMenu = true }) {
                                Icon(Icons.Default.ArrowDropDown, contentDescription = stringResource(Res.string.select_dashboard))
                            }
                            DropdownMenu(expanded = showDashboardMenu, onDismissRequest = { showDashboardMenu = false }) {
                                uiState.dashboards.forEach { db ->
                                    DropdownMenuItem(
                                        text = { Text(db.name) },
                                        onClick = {
                                            vm.selectDashboard(db)
                                            showDashboardMenu = false
                                        }
                                    )
                                }
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text(stringResource(Res.string.create_new_dashboard)) },
                                    onClick = {
                                        showCreateDashboardDialog = true
                                        showDashboardMenu = false
                                    }
                                )
                            }
                        }
                    }
                },
                actions = {
                    if (activeDashboard != null) {
                        if (collaborators.isNotEmpty()) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(2.dp),
                                modifier = Modifier.padding(end = 4.dp)
                            ) {
                                collaborators.take(3).forEach { user ->
                                    Surface(
                                        shape = CircleShape,
                                        color = MaterialTheme.colorScheme.primaryContainer,
                                        modifier = Modifier.size(22.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Text(
                                                text = user.email.take(1).uppercase(),
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onPrimaryContainer
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        IconButton(
                            onClick = { vm.undo() },
                            enabled = canUndo
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = "Undo")
                        }
                        IconButton(
                            onClick = { vm.redo() },
                            enabled = canRedo
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Redo, contentDescription = "Redo")
                        }
                        IconButton(onClick = { showCartSheet = true }) {
                            BadgedBox(
                                badge = {
                                    if (cartItems.isNotEmpty()) {
                                        Badge { Text(cartItems.size.toString()) }
                                    }
                                }
                            ) {
                                Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Query Cart")
                            }
                        }
                        IconButton(onClick = { showShareDialog = true }) {
                            Icon(Icons.Filled.Share, contentDescription = "Share Dashboard")
                        }
                        Box {
                            IconButton(onClick = { showExportMenu = true }) {
                                Icon(Icons.Filled.FileDownload, contentDescription = "Export Dashboard")
                            }
                            DropdownMenu(
                                expanded = showExportMenu,
                                onDismissRequest = { showExportMenu = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Clinical PDF Report") },
                                    onClick = {
                                        showExportMenu = false
                                        coroutineScope.launch {
                                            DashboardExportHelper.exportDashboardPdf(activeDashboard.id).fold(
                                                onSuccess = { artifact ->
                                                    DashboardExportHelper.saveExportedFile(artifact.filename, "binary_pdf_cached")
                                                    val saveRes = saveFileToDevice(artifact.filename, artifact.mimeType, artifact.bytes)
                                                    if (saveRes.isSuccess) {
                                                        snackbarHostState.showSnackbar("Report saved to ${artifact.filename}")
                                                    } else {
                                                        snackbarHostState.showSnackbar("Report exported locally: ${artifact.filename}")
                                                    }
                                                },
                                                onFailure = { err ->
                                                    snackbarHostState.showSnackbar(err.message ?: "Failed to export PDF")
                                                }
                                            )
                                        }
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("CSV Data Snapshot") },
                                    onClick = {
                                        showExportMenu = false
                                        coroutineScope.launch {
                                            DashboardExportHelper.exportDashboard(activeDashboard.id, "csv").fold(
                                                onSuccess = { artifact ->
                                                    DashboardExportHelper.saveExportedFile(artifact.filename, artifact.content)
                                                    val saveRes = saveFileToDevice(artifact.filename, artifact.mimeType, artifact.bytes)
                                                    if (saveRes.isSuccess) {
                                                        snackbarHostState.showSnackbar("CSV saved to ${artifact.filename}")
                                                    } else {
                                                        snackbarHostState.showSnackbar("CSV exported locally: ${artifact.filename}")
                                                    }
                                                },
                                                onFailure = { err ->
                                                    snackbarHostState.showSnackbar(err.message ?: "Failed to export CSV")
                                                }
                                            )
                                        }
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("JSON Layout Snapshot") },
                                    onClick = {
                                        showExportMenu = false
                                        coroutineScope.launch {
                                            DashboardExportHelper.exportDashboard(activeDashboard.id, "json").fold(
                                                onSuccess = { artifact ->
                                                    DashboardExportHelper.saveExportedFile(artifact.filename, artifact.content)
                                                    val saveRes = saveFileToDevice(artifact.filename, artifact.mimeType, artifact.bytes)
                                                    if (saveRes.isSuccess) {
                                                        snackbarHostState.showSnackbar("JSON saved to ${artifact.filename}")
                                                    } else {
                                                        snackbarHostState.showSnackbar("JSON exported locally: ${artifact.filename}")
                                                    }
                                                },
                                                onFailure = { err ->
                                                    snackbarHostState.showSnackbar(err.message ?: "Failed to export JSON")
                                                }
                                            )
                                        }
                                    }
                                )
                            }
                        }
                        IconButton(onClick = { vm.deleteDashboard(activeDashboard.id, errDeleteDb) }) {
                            Icon(Icons.Default.Delete, contentDescription = stringResource(Res.string.delete_dashboard))
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            if (activeDashboard != null) {
                FloatingActionButton(
                    onClick = { onAddWidget?.invoke(activeDashboard.id) },
                    modifier = Modifier.semantics { contentDescription = "Add Widget" }
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                }
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues), contentAlignment = Alignment.Center) {
            val currentError = uiState.errorMessage
            when {
                uiState.isLoading -> CircularProgressIndicator()
                !isDatabaseHealthy -> {
                    val dbMsg = healthState?.duckdb?.error ?: healthState?.postgres?.error ?: "Database service is experiencing storage or configuration errors."
                    DatabaseErrorCard(
                        title = "Database Misconfiguration",
                        message = dbMsg,
                        onRetry = { vm.retryHealthAndLoad() },
                        modifier = Modifier.padding(16.dp)
                    )
                }
                currentError != null -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = currentError, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                        Button(onClick = { vm.loadDashboards(errLoadDb) }) { Text(stringResource(Res.string.retry)) }
                    }
                }
                uiState.dashboards.isEmpty() -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(stringResource(Res.string.no_dashboards_found), style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { showCreateDashboardDialog = true }) {
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
                            onFiltersChanged = { dept, tr ->
                                vm.updateFilters(dept, tr)
                            },
                            onResetFilters = {
                                vm.resetFilters()
                            }
                        )

                        if (uiState.isOfflineSnapshot) {
                            Surface(
                                color = MaterialTheme.colorScheme.tertiaryContainer,
                                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = "Offline Snapshot Mode",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                                    modifier = Modifier.padding(8.dp)
                                )
                            }
                        }

                        if (widgets.isEmpty()) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text(stringResource(Res.string.dashboard_is_empty))
                            }
                        } else {
                            LazyVerticalGrid(
                                columns = GridCells.Adaptive(minSize = 300.dp),
                                contentPadding = PaddingValues(16.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp),
                                verticalArrangement = Arrangement.spacedBy(16.dp),
                                modifier = Modifier.fillMaxSize().testTag("dashboard_grid")
                            ) {
                                itemsIndexed(widgets) { index, widget ->
                                    val renderState = uiState.widgetDataMap[widget.id] ?: WidgetRenderState()
                                    WidgetElevatedCard(
                                        widget = widget,
                                        renderState = renderState,
                                        canMoveUp = index > 0,
                                        canMoveDown = index < widgets.size - 1,
                                        onMoveUp = { vm.reorderWidget(index, index - 1) },
                                        onMoveDown = { vm.reorderWidget(index, index + 1) },
                                        onEdit = { widgetToEdit = widget },
                                        onDelete = { vm.deleteWidgetWithUndo(widget, errDeleteWidget) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        if (showCreateDashboardDialog) {
            var newName by remember { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = { showCreateDashboardDialog = false },
                title = { Text(stringResource(Res.string.create_dashboard)) },
                text = {
                    OutlinedTextField(
                        value = newName,
                        onValueChange = { newName = it },
                        label = { Text(stringResource(Res.string.dashboard_name)) }
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        if (newName.isNotBlank()) vm.createDashboard(newName, errCreateDb)
                        showCreateDashboardDialog = false
                    }) { Text(stringResource(Res.string.create)) }
                },
                dismissButton = {
                    TextButton(onClick = { showCreateDashboardDialog = false }) { Text(stringResource(Res.string.cancel)) }
                }
            )
        }

        if (showShareDialog && activeDashboard != null) {
            DashboardShareDialog(
                dashboardId = activeDashboard.id,
                onDismiss = { showShareDialog = false }
            )
        }

        if (showCartSheet) {
            QueryCartBottomSheet(
                activeDashboardId = activeDashboard?.id,
                onDismiss = { showCartSheet = false },
                onQueriesDeployed = { vm.loadDashboards(errLoadDb) }
            )
        }

        val currentEditTarget = widgetToEdit
        if (currentEditTarget != null) {
            EditWidgetDialog(
                widget = currentEditTarget,
                onDismiss = { widgetToEdit = null },
                onWidgetUpdated = {
                    widgetToEdit = null
                    vm.loadDashboards(errLoadDb)
                }
            )
        }
    }
}

/**
 * Stateless card container rendering an analytical widget with header controls for editing, reordering, and deletion.
 *
 * @param widget The [WidgetResponse] data model to render.
 * @param renderState Parsed [WidgetRenderState] produced by [DashboardViewModel].
 * @param canMoveUp Whether this widget can be shifted earlier in the display order.
 * @param canMoveDown Whether this widget can be shifted later in the display order.
 * @param onMoveUp Callback to move the widget upward.
 * @param onMoveDown Callback to move the widget downward.
 * @param onEdit Callback to initiate in-place editing of widget configurations.
 * @param onDelete Callback to delete the widget.
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
    onDelete: () -> Unit = {}
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().height(300.dp),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = widget.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    modifier = Modifier.weight(1f)
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onMoveUp, enabled = canMoveUp) {
                        Icon(Icons.Default.ArrowUpward, contentDescription = "Move Up")
                    }
                    IconButton(onClick = onMoveDown, enabled = canMoveDown) {
                        Icon(Icons.Default.ArrowDownward, contentDescription = "Move Down")
                    }
                    IconButton(onClick = onEdit) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit Widget")
                    }
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, contentDescription = stringResource(Res.string.delete_widget))
                    }
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
            errText != null -> {
                val errorTxt = stringResource(Res.string.error, errText)
                Text(text = errorTxt, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            textContent != null -> {
                TextMarkdownWidget(content = textContent)
            }
            data.isEmpty() && tableRows.isEmpty() -> {
                Text(
                    text = "No data returned for this query",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            else -> {
                when (widget.visualization.lowercase()) {
                    "bar", "barchart", "bar_chart" -> BarChart(data = data)
                    "line", "linechart", "line_chart" -> LineChart(data = data)
                    "pie", "donut" -> PieChart(data = data)
                    "metric", "scalar" -> MetricCard(data = data)
                    "heatmap", "matrix" -> HeatmapChart(columns = tableColumns, rows = tableRows)
                    "markdown", "text", "note" -> TextMarkdownWidget(content = data.joinToString("; ") { "${it.first}: ${it.second}" })
                    else -> {
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
