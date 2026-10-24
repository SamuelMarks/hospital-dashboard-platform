/**
 * Benchmarks Screen module for displaying SQL and MPAX evaluation benchmarks,
 * delegating state and API calls to [BenchmarksViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.ui.screens.benchmarks.BenchmarksViewModel
import io.healthplatform.pulsequery.ui.screens.benchmarks.BenchmarksUiState as ViewModelBenchmarksUiState
import io.healthplatform.pulsequery.ui.screens.benchmarks.MpaxBenchmarkItem as ViewModelMpaxBenchmarkItem
import io.healthplatform.pulsequery.ui.screens.benchmarks.SqlBenchmarkItem as ViewModelSqlBenchmarkItem

/**
 * Re-exported [ViewModelSqlBenchmarkItem] typealias preserving package compatibility for callers and tests.
 */
typealias SqlBenchmarkItem = ViewModelSqlBenchmarkItem

/**
 * Re-exported [ViewModelSqlBenchmarkItem] scenario typealias preserving package compatibility for callers and tests.
 */
typealias SqlBenchmarkScenario = ViewModelSqlBenchmarkItem

/**
 * Re-exported [ViewModelMpaxBenchmarkItem] typealias preserving package compatibility for callers and tests.
 */
typealias MpaxBenchmarkItem = ViewModelMpaxBenchmarkItem

/**
 * Re-exported [ViewModelMpaxBenchmarkItem] scenario typealias preserving package compatibility for callers and tests.
 */
typealias MpaxBenchmarkScenario = ViewModelMpaxBenchmarkItem

/**
 * Re-exported [ViewModelBenchmarksUiState] typealias preserving package compatibility for callers and tests.
 */
typealias BenchmarksUiState = ViewModelBenchmarksUiState

/**
 * Screen rendering golden evaluation benchmarks for SQL generation and MPAX optimization.
 *
 * @param modifier Optional layout modifier.
 * @param initialState Optional initial [BenchmarksUiState] (useful for deterministic state testing and previews).
 * @param onSimulateMpax Callback invoked with scenario prompt to launch MPAX arena.
 * @param viewModel Optional [BenchmarksViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BenchmarksScreen(
    modifier: Modifier = Modifier,
    initialState: BenchmarksUiState? = null,
    onSimulateMpax: (String) -> Unit = {},
    viewModel: BenchmarksViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, initialState, coroutineScope) {
        viewModel ?: BenchmarksViewModel(
            scope = coroutineScope,
            initialState = initialState ?: BenchmarksUiState(isLoading = true)
        )
    }

    val uiState by vm.state.collectAsState()

    if (initialState == null && viewModel == null) {
        LaunchedEffect(vm) {
            vm.performLoadBenchmarks()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("AI & Optimization Benchmarks") },
                actions = {
                    IconButton(onClick = { vm.loadBenchmarks() }) {
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
            PrimaryTabRow(selectedTabIndex = uiState.selectedTabIndex) {
                Tab(
                    selected = uiState.selectedTabIndex == 0,
                    onClick = { vm.selectTab(0) },
                    text = { Text("Text-to-SQL (${uiState.sqlBenchmarks.size})") },
                    modifier = Modifier.testTag("tab-sql")
                )
                Tab(
                    selected = uiState.selectedTabIndex == 1,
                    onClick = { vm.selectTab(1) },
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
                            Button(onClick = { vm.loadBenchmarks() }) {
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
