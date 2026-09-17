/**
 * Component for rendering the DashboardScreen.
 * Provides the main user interface for this screen with full multi-modal widget lifecycle,
 * reordering, global filtering, undo/redo, and collaboration.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardCreate
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetReorderItem
import io.healthplatform.pulsequery.api.models.WidgetReorderRequest
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.api.models.WidgetCreateText
import io.healthplatform.pulsequery.api.models.WidgetCreateSql
import io.healthplatform.pulsequery.api.models.WidgetCreateHttp
import io.healthplatform.pulsequery.core.undo.DashboardCommand
import io.healthplatform.pulsequery.core.undo.UndoRedoManager
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.saveFileToDevice
import io.healthplatform.pulsequery.ui.components.FilterRibbon
import io.healthplatform.pulsequery.ui.components.cart.QueryCartBottomSheet
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardExportHelper
import io.healthplatform.pulsequery.ui.screens.dashboard.DashboardShareDialog
import io.healthplatform.pulsequery.ui.screens.dashboard.EditWidgetDialog
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import io.healthplatform.pulsequery.ui.components.charts.BarChart
import io.healthplatform.pulsequery.ui.components.charts.LineChart
import io.healthplatform.pulsequery.ui.components.charts.PieChart
import io.healthplatform.pulsequery.ui.components.charts.MetricCard
import io.healthplatform.pulsequery.ui.components.charts.MultiColumnTableView
import io.healthplatform.pulsequery.ui.components.charts.TableView
import io.healthplatform.pulsequery.ui.components.charts.TextMarkdownWidget
import io.healthplatform.pulsequery.ui.components.charts.HeatmapChart
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.floatOrNull
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Main application dashboard managing dashboards, global filtering, reordering, and displaying widgets.
 *
 * @param onAddWidget Optional callback invoked with the active dashboard ID to navigate to the widget creation wizard.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onAddWidget: ((String) -> Unit)? = null
) {
    var dashboards by remember { mutableStateOf<List<DashboardResponse>>(emptyList()) }
    var activeDashboard by remember { mutableStateOf<DashboardResponse?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showShareDialog by remember { mutableStateOf(false) }
    var showExportMenu by remember { mutableStateOf(false) }

    val isDatabaseHealthy by AppContainer.networkHealthRepository.isDatabaseHealthy.collectAsState()
    val healthState by AppContainer.networkHealthRepository.healthState.collectAsState()
    
    var showCreateDashboardDialog by remember { mutableStateOf(false) }
    var showDashboardMenu by remember { mutableStateOf(false) }
    var showCartSheet by remember { mutableStateOf(false) }
    var widgetToEdit by remember { mutableStateOf<WidgetResponse?>(null) }

    val undoRedoManager = remember { UndoRedoManager() }
    val canUndo by undoRedoManager.canUndo.collectAsState()
    val canRedo by undoRedoManager.canRedo.collectAsState()

    var filterDepartment by remember { mutableStateOf<String?>(null) }
    var filterTimeRange by remember { mutableStateOf<String?>(null) }

    val cartItems by AppContainer.queryCartRepository.stagedQueries.collectAsState()
    val collaborators by AppContainer.dashboardWebSocketRepository.activeCollaborators.collectAsState()

    val coroutineScope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    
    val errLoadDb = stringResource(Res.string.failed_to_load_dashboards, "")
    val errCreateDb = stringResource(Res.string.failed_to_create_dashboard, "")
    val errDeleteDb = stringResource(Res.string.failed_to_delete_dashboard, "")
    val errDeleteWidget = stringResource(Res.string.failed_to_delete_widget, "")
    var isOfflineSnapshot by remember { mutableStateOf(false) }

    fun loadDashboards() {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            runCatching {
                val response = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
                response.body()
            }.fold(
                onSuccess = { fetched ->
                    dashboards = fetched
                    isOfflineSnapshot = false
                    if (activeDashboard == null || dashboards.none { it.id == activeDashboard?.id }) {
                        activeDashboard = dashboards.firstOrNull()
                    } else {
                        activeDashboard = dashboards.find { it.id == activeDashboard?.id }
                    }
                    activeDashboard?.let { db ->
                        db.widgets?.forEach { w ->
                            AppContainer.widgetCacheStorage?.cacheWidget(
                                widgetId = w.id,
                                dashboardId = db.id,
                                dataJson = w.config.toString()
                            )
                        }
                    }
                },
                onFailure = { e ->
                    if (activeDashboard != null && AppContainer.widgetCacheStorage != null) {
                        val cached = AppContainer.widgetCacheStorage?.getCachedWidgets(activeDashboard!!.id)
                        if (!cached.isNullOrEmpty()) {
                            isOfflineSnapshot = true
                            errorMessage = null
                        } else {
                            errorMessage = errLoadDb + e.message
                        }
                    } else {
                        errorMessage = errLoadDb + e.message
                    }
                }
            )
            isLoading = false
        }
    }

    LaunchedEffect(activeDashboard?.id) {
        val dashId = activeDashboard?.id
        if (dashId != null) {
            AppContainer.dashboardWebSocketRepository.connect(dashId, AppContainer.currentToken)
        } else {
            AppContainer.dashboardWebSocketRepository.disconnect()
        }
    }

    LaunchedEffect(Unit) {
        AppContainer.dashboardWebSocketRepository.remoteWidgetUpdates.collect {
            loadDashboards()
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            AppContainer.dashboardWebSocketRepository.disconnect()
        }
    }

    LaunchedEffect(Unit) {
        loadDashboards()
    }

    fun createDashboard(name: String) {
        coroutineScope.launch {
            runCatching {
                AppContainer.dashboardsApi.createDashboardApiV1DashboardsPost(DashboardCreate(name = name))
            }.fold(
                onSuccess = { loadDashboards() },
                onFailure = { e -> errorMessage = errCreateDb + e.message }
            )
        }
    }

    fun deleteDashboard(id: String) {
        coroutineScope.launch {
            runCatching {
                AppContainer.dashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete(id)
            }.fold(
                onSuccess = {
                    activeDashboard = null
                    loadDashboards()
                },
                onFailure = { e -> errorMessage = errDeleteDb + e.message }
            )
        }
    }

    fun deleteWidget(widgetId: String) {
        coroutineScope.launch {
            runCatching {
                AppContainer.dashboardsApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(widgetId)
            }.fold(
                onSuccess = { loadDashboards() },
                onFailure = { e -> errorMessage = errDeleteWidget + e.message }
            )
        }
    }

    fun reorderWidget(currentIndex: Int, targetIndex: Int) {
        val currentDb = activeDashboard ?: return
        val currentWidgets = currentDb.widgets?.toMutableList() ?: return
        if (currentIndex !in currentWidgets.indices || targetIndex !in currentWidgets.indices) return
        val moved = currentWidgets.removeAt(currentIndex)
        currentWidgets.add(targetIndex, moved)
        activeDashboard = currentDb.copy(widgets = currentWidgets)
        coroutineScope.launch {
            runCatching {
                val req = WidgetReorderRequest(
                    items = currentWidgets.mapIndexed { idx, w ->
                        WidgetReorderItem(id = w.id, order = idx)
                    }
                )
                AppContainer.dashboardsApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost(currentDb.id, req)
            }.onFailure { e ->
                errorMessage = "Failed to persist widget order: ${e.message}"
                loadDashboards()
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(activeDashboard?.name ?: stringResource(Res.string.dashboards))
                        if (dashboards.isNotEmpty()) {
                            IconButton(onClick = { showDashboardMenu = true }) {
                                Icon(Icons.Default.ArrowDropDown, contentDescription = stringResource(Res.string.select_dashboard))
                            }
                            DropdownMenu(expanded = showDashboardMenu, onDismissRequest = { showDashboardMenu = false }) {
                                dashboards.forEach { db ->
                                    DropdownMenuItem(
                                        text = { Text(db.name) },
                                        onClick = {
                                            activeDashboard = db
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
                            onClick = {
                                coroutineScope.launch {
                                    undoRedoManager.undo()
                                    loadDashboards()
                                }
                            },
                            enabled = canUndo
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = "Undo")
                        }
                        IconButton(
                            onClick = {
                                coroutineScope.launch {
                                    undoRedoManager.redo()
                                    loadDashboards()
                                }
                            },
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
                                            val result = DashboardExportHelper.exportDashboardPdf(activeDashboard!!.id)
                                            if (result.success) {
                                                DashboardExportHelper.saveExportedFile(result.filename, "binary_pdf_cached")
                                                val saveRes = saveFileToDevice(result.filename, result.mimeType, result.bytes)
                                                if (saveRes.isSuccess) {
                                                    snackbarHostState.showSnackbar("Report saved to ${result.filename}")
                                                } else {
                                                    snackbarHostState.showSnackbar("Report exported locally: ${result.filename}")
                                                }
                                            } else {
                                                snackbarHostState.showSnackbar(result.errorMessage ?: "Failed to export PDF")
                                            }
                                        }
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("CSV Data Snapshot") },
                                    onClick = {
                                        showExportMenu = false
                                        coroutineScope.launch {
                                            val result = DashboardExportHelper.exportDashboard(activeDashboard!!.id, "csv")
                                            if (result.success) {
                                                DashboardExportHelper.saveExportedFile(result.filename, result.content)
                                                val saveRes = saveFileToDevice(result.filename, result.mimeType, result.bytes)
                                                if (saveRes.isSuccess) {
                                                    snackbarHostState.showSnackbar("CSV saved to ${result.filename}")
                                                } else {
                                                    snackbarHostState.showSnackbar("CSV exported locally: ${result.filename}")
                                                }
                                            } else {
                                                snackbarHostState.showSnackbar(result.errorMessage ?: "Failed to export CSV")
                                            }
                                        }
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("JSON Layout Snapshot") },
                                    onClick = {
                                        showExportMenu = false
                                        coroutineScope.launch {
                                            val result = DashboardExportHelper.exportDashboard(activeDashboard!!.id, "json")
                                            if (result.success) {
                                                DashboardExportHelper.saveExportedFile(result.filename, result.content)
                                                val saveRes = saveFileToDevice(result.filename, result.mimeType, result.bytes)
                                                if (saveRes.isSuccess) {
                                                    snackbarHostState.showSnackbar("JSON saved to ${result.filename}")
                                                } else {
                                                    snackbarHostState.showSnackbar("JSON exported locally: ${result.filename}")
                                                }
                                            } else {
                                                snackbarHostState.showSnackbar(result.errorMessage ?: "Failed to export JSON")
                                            }
                                        }
                                    }
                                )
                            }
                        }
                        IconButton(onClick = { deleteDashboard(activeDashboard!!.id) }) {
                            Icon(Icons.Default.Delete, contentDescription = stringResource(Res.string.delete_dashboard))
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            if (activeDashboard != null) {
                FloatingActionButton(
                    onClick = { activeDashboard?.let { onAddWidget?.invoke(it.id) } },
                    modifier = Modifier.semantics { contentDescription = "Add Widget" }
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                }
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues), contentAlignment = Alignment.Center) {
            when {
                isLoading -> CircularProgressIndicator()
                !isDatabaseHealthy -> {
                    val dbMsg = healthState?.duckdb?.error ?: healthState?.postgres?.error ?: "Database service is experiencing storage or configuration errors."
                    DatabaseErrorCard(
                        title = "Database Misconfiguration",
                        message = dbMsg,
                        onRetry = {
                            AppContainer.networkHealthRepository.refreshHealth()
                            loadDashboards()
                        },
                        modifier = Modifier.padding(16.dp)
                    )
                }
                errorMessage != null -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                        Button(onClick = { loadDashboards() }) { Text(stringResource(Res.string.retry)) }
                    }
                }
                dashboards.isEmpty() -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(stringResource(Res.string.no_dashboards_found), style = MaterialTheme.typography.bodyLarge)
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { showCreateDashboardDialog = true }) {
                            Text(stringResource(Res.string.create_dashboard))
                        }
                    }
                }
                activeDashboard != null -> {
                    val widgets = activeDashboard?.widgets ?: emptyList()
                    Column(modifier = Modifier.fillMaxSize()) {
                        FilterRibbon(
                            activeDepartment = filterDepartment,
                            activeTimeRange = filterTimeRange,
                            onFiltersChanged = { dept, tr ->
                                filterDepartment = dept
                                filterTimeRange = tr
                                loadDashboards()
                            },
                            onResetFilters = {
                                filterDepartment = null
                                filterTimeRange = null
                                loadDashboards()
                            }
                        )

                        if (isOfflineSnapshot) {
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
                                modifier = Modifier.fillMaxSize()
                            ) {
                                itemsIndexed(widgets) { index, widget ->
                                    WidgetElevatedCard(
                                        widget = widget,
                                        canMoveUp = index > 0,
                                        canMoveDown = index < widgets.size - 1,
                                        onMoveUp = { reorderWidget(index, index - 1) },
                                        onMoveDown = { reorderWidget(index, index + 1) },
                                        onEdit = { widgetToEdit = widget },
                                        onDelete = {
                                            coroutineScope.launch {
                                                undoRedoManager.executeCommand(object : DashboardCommand {
                                                    override val description: String = "Delete Widget ${widget.title}"
                                                    override suspend fun execute(): Result<Unit> {
                                                        deleteWidget(widget.id)
                                                        return Result.success(Unit)
                                                    }
                                                    override suspend fun undo(): Result<Unit> {
                                                        loadDashboards()
                                                        return Result.success(Unit)
                                                    }
                                                })
                                            }
                                        }
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
                        if (newName.isNotBlank()) createDashboard(newName)
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
                dashboardId = activeDashboard!!.id,
                onDismiss = { showShareDialog = false }
            )
        }

        if (showCartSheet) {
            QueryCartBottomSheet(
                activeDashboardId = activeDashboard?.id,
                onDismiss = { showCartSheet = false },
                onQueriesDeployed = { loadDashboards() }
            )
        }

        if (widgetToEdit != null) {
            EditWidgetDialog(
                widget = widgetToEdit!!,
                onDismiss = { widgetToEdit = null },
                onWidgetUpdated = {
                    widgetToEdit = null
                    loadDashboards()
                }
            )
        }
    }
}

/**
 * Card container rendering an analytical widget with header controls for editing, reordering, and deletion.
 *
 * @param widget The [WidgetResponse] data model to render.
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
    canMoveUp: Boolean = false,
    canMoveDown: Boolean = false,
    onMoveUp: () -> Unit = {},
    onMoveDown: () -> Unit = {},
    onEdit: () -> Unit = {},
    onDelete: () -> Unit = {}
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().heightIn(min = 300.dp),
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
            WidgetContent(widget)
        }
    }
}

/**
 * Dispatches and renders widget data visualization (charts, tables, or markdown notes)
 * based on the widget's type and visualization schema.
 *
 * @param widget The [WidgetResponse] data model to fetch data for and display.
 */
@Composable
fun WidgetContent(widget: WidgetResponse) {
    var data by remember { mutableStateOf<List<Pair<String, Float>>?>(null) }
    var tableColumns by remember { mutableStateOf<List<String>>(emptyList()) }
    var tableRows by remember { mutableStateOf<List<List<String>>>(emptyList()) }
    var textContent by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val errLoadDataMsg = stringResource(Res.string.failed_to_load_data)

    LaunchedEffect(widget.id) {
        if (widget.type.equals("TEXT", ignoreCase = true)) {
            val content = (widget.config["content"] as? JsonPrimitive)?.content
                ?: widget.config["text"]?.toString()?.replace("\"", "")
                ?: ""
            textContent = content
            return@LaunchedEffect
        }

        isLoading = true
        runCatching {
            val response = AppContainer.executionApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
                dashboardId = widget.dashboardId,
                widgetId = widget.id
            )
            val jsonResult = response.body()
            val parsedData = mutableListOf<Pair<String, Float>>()
            val cols = mutableListOf<String>()
            val rows = mutableListOf<List<String>>()

            val xKey = widget.config["xKey"]?.toString()?.replace('"', ' ')?.trim() ?: "label"
            val yKey = widget.config["yKey"]?.toString()?.replace('"', ' ')?.trim() ?: "value"
            val elements = jsonResult["data"]
            if (elements is kotlinx.serialization.json.JsonArray) {
                elements.forEachIndexed { index, element ->
                    if (element is kotlinx.serialization.json.JsonObject) {
                        if (index == 0) {
                            cols.addAll(element.keys)
                        }
                        val rowVals = cols.map { k ->
                            (element[k] as? JsonPrimitive)?.content ?: ""
                        }
                        rows.add(rowVals)

                        val label = (element[xKey] as? JsonPrimitive)?.content ?: "Unknown"
                        val value = (element[yKey] as? JsonPrimitive)?.floatOrNull ?: 0f
                        parsedData.add(label to value)
                    }
                }
            }
            Triple(parsedData, cols, rows)
        }.fold(
            onSuccess = { (parsedData, cols, rows) ->
                data = parsedData
                tableColumns = cols
                tableRows = rows
            },
            onFailure = { e ->
                errorMessage = e.message ?: errLoadDataMsg
            }
        )
        isLoading = false
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        when {
            isLoading -> CircularProgressIndicator()
            errorMessage != null -> {
                val errorTxt = stringResource(Res.string.error, errorMessage!!)
                Text(text = errorTxt, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            textContent != null -> {
                TextMarkdownWidget(content = textContent!!)
            }
            data != null -> {
                if (data!!.isEmpty() && tableRows.isEmpty()) {
                    Text(
                        text = "No data returned for this query",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    when (widget.visualization.lowercase()) {
                        "bar", "barchart", "bar_chart" -> BarChart(data = data!!)
                        "line", "linechart", "line_chart" -> LineChart(data = data!!)
                        "pie", "donut" -> PieChart(data = data!!)
                        "metric", "scalar" -> MetricCard(data = data!!)
                        "heatmap", "matrix" -> HeatmapChart(columns = tableColumns, rows = tableRows)
                        "markdown", "text", "note" -> TextMarkdownWidget(content = data!!.joinToString("\n") { "${it.first}: ${it.second}" })
                        else -> {
                            if (tableColumns.size > 2) {
                                MultiColumnTableView(columns = tableColumns, rows = tableRows)
                            } else {
                                TableView(data = data!!)
                            }
                        }
                    }
                }
            }
        }
    }
}
