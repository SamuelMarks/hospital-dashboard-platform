package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items as lazyListItems
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.charts.BarChart
import io.healthplatform.pulsequery.ui.components.charts.LineChart
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.floatOrNull

/**
 * Main application dashboard displaying widgets.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onNavigateToChat: () -> Unit = {},
    onNavigateToAnalytics: () -> Unit = {},
    onNavigateToSimulation: () -> Unit = {},
    onNavigateToAdmin: () -> Unit = {},
    onNavigateToEditor: () -> Unit = {}
) {
    var dashboards by remember { mutableStateOf<List<DashboardResponse>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val coroutineScope = rememberCoroutineScope()

    // Fetch initial dashboards
    fun loadDashboards() {
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            try {
                val response = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
                dashboards = response.body()
            } catch (e: Exception) {
                errorMessage = "Failed to load dashboards: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loadDashboards()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Workspace Dashboard") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                ),
                actions = {
                    TextButton(onClick = onNavigateToAnalytics) {
                        Text("Analytics", color = MaterialTheme.colorScheme.onPrimary)
                    }
                    TextButton(onClick = onNavigateToSimulation) {
                        Text("Simulate", color = MaterialTheme.colorScheme.onPrimary)
                    }
                    TextButton(onClick = onNavigateToEditor) {
                        Text("SQL Editor", color = MaterialTheme.colorScheme.onPrimary)
                    }
                    TextButton(onClick = onNavigateToAdmin) {
                        Text("Admin", color = MaterialTheme.colorScheme.onPrimary)
                    }
                    TextButton(onClick = onNavigateToChat) {
                        Text("Chat", color = MaterialTheme.colorScheme.onPrimary)
                    }
                    TextButton(onClick = { loadDashboards() }) {
                        Text("Refresh", color = MaterialTheme.colorScheme.onPrimary)
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentAlignment = Alignment.Center
        ) {
            when {
                isLoading -> {
                    CircularProgressIndicator()
                }
                errorMessage != null -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = errorMessage!!,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(16.dp)
                        )
                        Button(onClick = { loadDashboards() }) {
                            Text("Retry")
                        }
                    }
                }
                dashboards.isEmpty() -> {
                    Text(
                        text = "No dashboards found. Try creating one in the workspace.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                else -> {
                    // Display the first dashboard's widgets as a quick prototype
                    val activeDashboard = dashboards.first()
                    val widgets = activeDashboard.widgets ?: emptyList()

                    if (widgets.isEmpty()) {
                        Text(
                            text = "Dashboard '${activeDashboard.name}' is empty.",
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Adaptive(minSize = 300.dp),
                            contentPadding = PaddingValues(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(widgets) { widget ->
                                WidgetCard(widget)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun WidgetCard(widget: WidgetResponse) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp), // Increased height for chart rendering
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant,
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp).fillMaxSize()
        ) {
            Text(
                text = widget.title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
            Spacer(modifier = Modifier.height(8.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.2f))
            Spacer(modifier = Modifier.height(8.dp))
            
            // Dynamic Widget Content (Chart/Data Fetching)
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

    LaunchedEffect(widget.id) {
        isLoading = true
        try {
            // Fetch live widget data from the backend execution engine
            val response = AppContainer.executionApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
                dashboardId = widget.dashboardId,
                widgetId = widget.id
            )
            
            val jsonResult = response.body()
            val parsedData = mutableListOf<Pair<String, Float>>()
            
            // Very basic heuristic mapping for prototype visual charting
            // We assume the backend returns rows in "data" or direct key/values.
            val xKey = widget.config["xKey"]?.toString()?.replace("\"", "") ?: "label"
            val yKey = widget.config["yKey"]?.toString()?.replace("\"", "") ?: "value"
            
            // We simulate parsing the resulting map
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
            
            data = parsedData.takeIf { it.isNotEmpty() } ?: listOf("A" to 10f, "B" to 25f, "C" to 15f) // Fallback mock for UI visualization if empty
            
        } catch (e: Exception) {
            errorMessage = e.message ?: "Failed to load data"
        } finally {
            isLoading = false
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        when {
            isLoading -> CircularProgressIndicator()
            errorMessage != null -> Text(text = "Error: $errorMessage", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            data != null -> {
                when (widget.visualization.lowercase()) {
                    "bar", "barchart" -> BarChart(data = data!!)
                    "line", "linechart" -> LineChart(data = data!!)
                    else -> {
                        // Fallback text display
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
