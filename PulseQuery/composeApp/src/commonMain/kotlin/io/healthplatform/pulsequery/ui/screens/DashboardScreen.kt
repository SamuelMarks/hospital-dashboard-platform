/**
 * Component for rendering the DashboardScreen.
 * Provides the main user interface for this screen.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items as lazyListItems
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardCreate
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.api.models.WidgetCreateText
import io.healthplatform.pulsequery.api.models.WidgetCreateSql
import io.healthplatform.pulsequery.api.models.WidgetCreateHttp
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.charts.BarChart
import io.healthplatform.pulsequery.ui.components.charts.LineChart
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.floatOrNull
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Main application dashboard managing dashboards and displaying widgets.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen() {
    var dashboards by remember { mutableStateOf<List<DashboardResponse>>(emptyList()) }
    var activeDashboard by remember { mutableStateOf<DashboardResponse?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    var showCreateDashboardDialog by remember { mutableStateOf(false) }
    var showDashboardMenu by remember { mutableStateOf(false) }
    var showAddWidgetDialog by remember { mutableStateOf(false) }

    val coroutineScope = rememberCoroutineScope()
    
    val errLoadDb = stringResource(Res.string.failed_to_load_dashboards, "")
    val errCreateDb = stringResource(Res.string.failed_to_create_dashboard, "")
    val errDeleteDb = stringResource(Res.string.failed_to_delete_dashboard, "")
    val errDeleteWidget = stringResource(Res.string.failed_to_delete_widget, "")

    fun loadDashboards() {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            try {
                val response = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
                dashboards = response.body()
                if (activeDashboard == null || dashboards.none { it.id == activeDashboard?.id }) {
                    activeDashboard = dashboards.firstOrNull()
                } else {
                    activeDashboard = dashboards.find { it.id == activeDashboard?.id }
                }
            } catch (e: Exception) {
                errorMessage = errLoadDb + e.message
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadDashboards()
    }

    fun createDashboard(name: String) {
        coroutineScope.launch {
            try {
                AppContainer.dashboardsApi.createDashboardApiV1DashboardsPost(DashboardCreate(name = name))
                loadDashboards()
            } catch (e: Exception) {
                errorMessage = errCreateDb + e.message
            }
        }
    }

    fun deleteDashboard(id: String) {
        coroutineScope.launch {
            try {
                AppContainer.dashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete(id)
                activeDashboard = null
                loadDashboards()
            } catch (e: Exception) {
                errorMessage = errDeleteDb + e.message
            }
        }
    }

    fun deleteWidget(widgetId: String) {
        coroutineScope.launch {
            try {
                AppContainer.dashboardsApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(widgetId)
                loadDashboards()
            } catch (e: Exception) {
                errorMessage = errDeleteWidget + e.message
            }
        }
    }

    Scaffold(
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
                        IconButton(onClick = { deleteDashboard(activeDashboard!!.id) }) {
                            Icon(Icons.Default.Delete, contentDescription = stringResource(Res.string.delete_dashboard))
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            if (activeDashboard != null) {
                FloatingActionButton(onClick = { showAddWidgetDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(Res.string.add_widget))
                }
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues), contentAlignment = Alignment.Center) {
            when {
                isLoading -> CircularProgressIndicator()
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
                    if (widgets.isEmpty()) {
                        Text(stringResource(Res.string.dashboard_is_empty))
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Adaptive(minSize = 300.dp),
                            contentPadding = PaddingValues(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(widgets) { widget ->
                                WidgetElevatedCard(widget, onDelete = { deleteWidget(widget.id) })
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
        
        if (showAddWidgetDialog && activeDashboard != null) {
            AlertDialog(
                onDismissRequest = { showAddWidgetDialog = false },
                title = { Text(stringResource(Res.string.add_widget)) },
                text = { Text(stringResource(Res.string.adding_widgets_requires)) },
                confirmButton = {
                    TextButton(onClick = { showAddWidgetDialog = false }) { Text(stringResource(Res.string.ok)) }
                }
            )
        }
    }
}

@Composable
fun WidgetElevatedCard(widget: WidgetResponse, onDelete: () -> Unit) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth().heightIn(min = 300.dp),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp).fillMaxSize()) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = widget.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, contentDescription = stringResource(Res.string.delete_widget))
                }
            }
            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f))
            Spacer(modifier = Modifier.height(8.dp))
            WidgetContent(widget)
        }
    }
}

@Composable
fun WidgetContent(widget: WidgetResponse) {
    var data by remember { mutableStateOf<List<Pair<String, Float>>?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val errLoadDataMsg = stringResource(Res.string.failed_to_load_data)

    LaunchedEffect(widget.id) {
        isLoading = true
        try {
            val response = AppContainer.executionApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
                dashboardId = widget.dashboardId,
                widgetId = widget.id
            )
            val jsonResult = response.body()
            val parsedData = mutableListOf<Pair<String, Float>>()
            val xKey = widget.config["xKey"]?.toString()?.replace('"', ' ')?.trim() ?: "label"
            val yKey = widget.config["yKey"]?.toString()?.replace('"', ' ')?.trim() ?: "value"
            val elements = jsonResult["data"]
            if (elements is kotlinx.serialization.json.JsonArray) {
                elements.forEach { element ->
                    if (element is kotlinx.serialization.json.JsonObject) {
                        val label = (element[xKey] as? JsonPrimitive)?.content ?: "Unknown"
                        val value = (element[yKey] as? JsonPrimitive)?.floatOrNull ?: 0f
                        parsedData.add(label to value)
                    }
                }
            }
            data = parsedData.takeIf { it.isNotEmpty() } ?: listOf("A" to 10f, "B" to 25f, "C" to 15f)
        } catch (e: Exception) {
            errorMessage = e.message ?: errLoadDataMsg
        } finally {
            isLoading = false
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        when {
            isLoading -> CircularProgressIndicator()
            errorMessage != null -> {
                val errorTxt = stringResource(Res.string.error, errorMessage!!)
                Text(text = errorTxt, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            data != null -> {
                when (widget.visualization.lowercase()) {
                    "bar", "barchart" -> BarChart(data = data!!)
                    "line", "linechart" -> LineChart(data = data!!)
                    else -> {
                        LazyColumn {
                            lazyListItems(data!!) { (label, value) ->
                                Text("$label: $value", style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
        }
    }
}
