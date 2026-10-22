/**
 * Benchmarks ViewModel module orchestrating the retrieval and parsing of
 * gold-standard Text-to-SQL and MPAX hospital optimization benchmark scenarios.
 */
package io.healthplatform.pulsequery.ui.screens.benchmarks

import io.healthplatform.pulsequery.api.apis.BenchmarksApi
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
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
 * Typealias for [SqlBenchmarkItem] representing a SQL benchmark scenario.
 */
typealias SqlBenchmarkScenario = SqlBenchmarkItem

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
 * Typealias for [MpaxBenchmarkItem] representing an MPAX benchmark scenario.
 */
typealias MpaxBenchmarkScenario = MpaxBenchmarkItem

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
 * ViewModel managing state and backend calls for the Benchmarks screen.
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property benchmarksApi Optional explicit [BenchmarksApi] client for retrieving SQL and MPAX benchmark catalogs.
 * @param initialState Initial [BenchmarksUiState] to seed the ViewModel.
 */
class BenchmarksViewModel(
    private val scope: CoroutineScope,
    private val benchmarksApi: BenchmarksApi? = null,
    initialState: BenchmarksUiState = BenchmarksUiState(isLoading = true)
) {
    private val currentBenchmarksApi: BenchmarksApi
        get() = benchmarksApi ?: AppContainer.benchmarksApi

    private val _state = MutableStateFlow(initialState)

    /** Reactive [StateFlow] of the current [BenchmarksUiState]. */
    val state: StateFlow<BenchmarksUiState> = _state.asStateFlow()

    /**
     * Selects the active benchmark category tab.
     *
     * @param tabIndex Selected tab index (0 for SQL, 1 for MPAX).
     */
    fun selectTab(tabIndex: Int) {
        _state.update { it.copy(selectedTabIndex = tabIndex) }
    }

    /**
     * Triggers asynchronous loading of SQL and MPAX benchmark catalogs.
     */
    fun loadBenchmarks() {
        scope.launch {
            performLoadBenchmarks()
        }
    }

    /**
     * Executes the asynchronous loading and parsing of SQL and MPAX benchmark catalogs.
     */
    suspend fun performLoadBenchmarks() {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        runCatchingPulseAsync {
            val sqlRaw = currentBenchmarksApi.getSqlBenchmarksApiV1BenchmarksSqlGet().body()
            val mpaxRaw = currentBenchmarksApi.getMpaxBenchmarksApiV1BenchmarksMpaxGet().body()
            val sqlItems = sqlRaw.map { parseSqlBenchmarkItem(it) }
            val mpaxItems = mpaxRaw.map { parseMpaxBenchmarkItem(it) }
            Pair(sqlItems, mpaxItems)
        }.fold(
            onSuccess = { (sqlItems, mpaxItems) ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        sqlBenchmarks = sqlItems,
                        mpaxBenchmarks = mpaxItems,
                        errorMessage = null
                    )
                }
            },
            onFailure = { e ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = e.messageOrDefault("Failed to load benchmarks")
                    )
                }
            }
        )
    }

    /**
     * Parses a raw SQL benchmark map entry into a typed [SqlBenchmarkItem].
     *
     * @param elemMap Raw benchmark JSON map entry.
     * @return Parsed [SqlBenchmarkItem].
     */
    private fun parseSqlBenchmarkItem(elemMap: Map<String, *>): SqlBenchmarkItem {
        return SqlBenchmarkItem(
            theme = extractField(elemMap, "theme") ?: "General",
            sql = extractField(elemMap, "sql").orEmpty(),
            difficulty = extractField(elemMap, "difficulty") ?: "Medium",
            description = extractField(elemMap, "description")
                ?: extractField(elemMap, "question")
                .orEmpty()
        )
    }

    /**
     * Parses a raw MPAX benchmark map entry into a typed [MpaxBenchmarkItem].
     *
     * @param elemMap Raw MPAX benchmark JSON map entry.
     * @return Parsed [MpaxBenchmarkItem].
     */
    private fun parseMpaxBenchmarkItem(elemMap: Map<String, *>): MpaxBenchmarkItem {
        return MpaxBenchmarkItem(
            title = extractField(elemMap, "title") ?: "Optimization Scenario",
            difficulty = extractField(elemMap, "difficulty") ?: "Standard",
            description = extractField(elemMap, "description").orEmpty(),
            targetService = extractField(elemMap, "target_service") ?: "Hospital Wide"
        )
    }

    /**
     * Extracts a string value for [key] from an untyped benchmark map entry.
     *
     * @param map Map representing a raw benchmark JSON object.
     * @param key Property key to extract.
     * @return Extracted string value, or null if absent.
     */
    private fun extractField(map: Map<String, *>, key: String): String? {
        return map[key]?.let { value ->
            if (value is JsonElement) {
                value.jsonPrimitive.content
            } else {
                value.toString().trim('"')
            }
        }
    }
}
