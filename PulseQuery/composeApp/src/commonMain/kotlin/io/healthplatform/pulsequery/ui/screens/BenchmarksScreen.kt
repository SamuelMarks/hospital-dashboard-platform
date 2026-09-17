/**
 * Benchmarks Screen module for displaying SQL and MPAX evaluation benchmarks.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonPrimitive

/**
 * Represents a parsed gold-standard SQL benchmark entry.
 *
 * @property theme Clinical or operational theme of the query.
 * @property sql Ground-truth SQL query text.
 * @property difficulty Complexity rating of the scenario.
 * @property description Detailed scenario problem statement.
 */
data class SqlBenchmarkItem(
    val theme: String,
    val sql: String,
    val difficulty: String,
    val description: String
)

/**
 * Represents a parsed MPAX linear programming benchmark scenario.
 *
 * @property title Scenario title.
 * @property difficulty Difficulty tier (e.g., Simple, Medium, Complex).
 * @property description High-level description of capacity constraints.
 * @property targetService Target medical service or department.
 */
data class MpaxBenchmarkItem(
    val title: String,
    val difficulty: String,
    val description: String,
    val targetService: String
)

/**
 * State container for the Benchmarks UI screen.
 *
 * @property isLoading Flag indicating whether benchmarks are currently being fetched.
 * @property errorMessage User-visible error text if loading fails.
 * @property selectedTabIndex Currently selected tab index (0 for SQL, 1 for MPAX).
 * @property sqlBenchmarks List of loaded SQL benchmark items.
 * @property mpaxBenchmarks List of loaded MPAX benchmark items.
 */
data class BenchmarksUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val selectedTabIndex: Int = 0,
    val sqlBenchmarks: List<SqlBenchmarkItem> = emptyList(),
    val mpaxBenchmarks: List<MpaxBenchmarkItem> = emptyList()
)

/**
 * Screen rendering golden evaluation benchmarks for SQL generation and MPAX optimization.
 *
 * @param modifier Optional layout modifier.
 * @param onSimulateMpax Callback invoked with scenario prompt to launch MPAX arena.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BenchmarksScreen(
    modifier: Modifier = Modifier,
    onSimulateMpax: (String) -> Unit = {}
) {
    var uiState by remember { mutableStateOf(BenchmarksUiState(isLoading = true)) }
    val coroutineScope = rememberCoroutineScope()

    /**
     * Loads SQL and MPAX benchmarks asynchronously from the backend API.
     */
    fun loadBenchmarks() {
        coroutineScope.launch {
            uiState = uiState.copy(isLoading = true, errorMessage = null)
            runCatching {
                val sqlRaw = AppContainer.benchmarksApi.getSqlBenchmarksApiV1BenchmarksSqlGet().body()
                val mpaxRaw = AppContainer.benchmarksApi.getMpaxBenchmarksApiV1BenchmarksMpaxGet().body()

                val sqlItems = sqlRaw.map { map ->
                    val elemMap = map as? Map<*, *> ?: emptyMap<String, Any>()
                    val themeVal = elemMap["theme"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: "General"
                    val sqlVal = elemMap["sql"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: ""
                    val diffVal = elemMap["difficulty"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: "Medium"
                    val descVal = elemMap["description"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') }
                        ?: elemMap["question"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: ""

                    SqlBenchmarkItem(
                        theme = themeVal,
                        sql = sqlVal,
                        difficulty = diffVal,
                        description = descVal
                    )
                }

                val mpaxItems = mpaxRaw.map { map ->
                    val elemMap = map as? Map<*, *> ?: emptyMap<String, Any>()
                    val titleVal = elemMap["title"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: "Optimization Scenario"
                    val diffVal = elemMap["difficulty"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: "Standard"
                    val descVal = elemMap["description"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: ""
                    val targetVal = elemMap["target_service"]?.let { (it as? JsonElement)?.jsonPrimitive?.content ?: it.toString().trim('"') } ?: "Hospital Wide"

                    MpaxBenchmarkItem(
                        title = titleVal,
                        difficulty = diffVal,
                        description = descVal,
                        targetService = targetVal
                    )
                }

                Pair(sqlItems, mpaxItems)
            }.fold(
                onSuccess = { (sqlItems, mpaxItems) ->
                    uiState = uiState.copy(
                        isLoading = false,
                        sqlBenchmarks = sqlItems,
                        mpaxBenchmarks = mpaxItems
                    )
                },
                onFailure = { e ->
                    uiState = uiState.copy(
                        isLoading = false,
                        errorMessage = e.message ?: "Failed to load benchmarks"
                    )
                }
            )
        }
    }

    LaunchedEffect(Unit) {
        loadBenchmarks()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI & Optimization Benchmarks") },
                actions = {
                    IconButton(onClick = { loadBenchmarks() }) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh Benchmarks")
                    }
                }
            )
        },
        modifier = modifier.fillMaxSize()
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            TabRow(selectedTabIndex = uiState.selectedTabIndex) {
                Tab(
                    selected = uiState.selectedTabIndex == 0,
                    onClick = { uiState = uiState.copy(selectedTabIndex = 0) },
                    text = { Text("Text-to-SQL (${uiState.sqlBenchmarks.size})") },
                    modifier = Modifier.testTag("tab-sql")
                )
                Tab(
                    selected = uiState.selectedTabIndex == 1,
                    onClick = { uiState = uiState.copy(selectedTabIndex = 1) },
                    text = { Text("MPAX Scenarios (${uiState.mpaxBenchmarks.size})") },
                    modifier = Modifier.testTag("tab-mpax")
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                when {
                    uiState.isLoading -> {
                        CircularProgressIndicator()
                    }
                    uiState.errorMessage != null -> {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = uiState.errorMessage ?: "Unknown error",
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyLarge
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(onClick = { loadBenchmarks() }) {
                                Text("Retry")
                            }
                        }
                    }
                    uiState.selectedTabIndex == 0 -> {
                        if (uiState.sqlBenchmarks.isEmpty()) {
                            Text(
                                text = "No SQL benchmarks available.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(uiState.sqlBenchmarks) { item ->
                                    SqlBenchmarkCard(item = item)
                                }
                            }
                        }
                    }
                    else -> {
                        if (uiState.mpaxBenchmarks.isEmpty()) {
                            Text(
                                text = "No MPAX benchmarks available.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            LazyColumn(
                                modifier = Modifier.fillMaxSize(),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(uiState.mpaxBenchmarks) { item ->
                                    MpaxBenchmarkCard(
                                        item = item,
                                        onSimulateMpax = onSimulateMpax
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Card displaying an individual SQL benchmark item with theme, question, and SQL snippet.
 *
 * @param item The SQL benchmark item to render.
 * @param modifier Optional modifier for the card container.
 */
@Composable
fun SqlBenchmarkCard(
    item: SqlBenchmarkItem,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.theme,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                AssistChip(
                    onClick = {},
                    label = { Text(item.difficulty) }
                )
            }
            if (item.description.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = item.description,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            if (item.sql.isNotBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            color = MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(8.dp)
                        )
                        .padding(12.dp)
                ) {
                    Text(
                        text = item.sql,
                        fontFamily = FontFamily.Monospace,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
    }
}

/**
 * Card displaying an individual MPAX linear programming benchmark item.
 *
 * @param item The MPAX benchmark item to render.
 * @param modifier Optional modifier for the card container.
 * @param onSimulateMpax Callback when launching scenario into MPAX arena.
 */
@Composable
fun MpaxBenchmarkCard(
    item: MpaxBenchmarkItem,
    modifier: Modifier = Modifier,
    onSimulateMpax: (String) -> Unit = {}
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                AssistChip(
                    onClick = {},
                    label = { Text(item.difficulty) }
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Service: ${item.targetService}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.secondary
            )
            if (item.description.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = item.description,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            OutlinedButton(
                onClick = { onSimulateMpax(item.description.ifBlank { item.title }) },
                modifier = Modifier.align(Alignment.End)
            ) {
                Text("Simulate in Arena")
            }
        }
    }
}
