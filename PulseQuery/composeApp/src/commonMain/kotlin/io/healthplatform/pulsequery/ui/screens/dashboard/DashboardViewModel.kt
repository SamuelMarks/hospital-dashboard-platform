/**
 * Dashboard ViewModel module orchestrating dashboard CRUD, batch widget execution,
 * global filtering, offline widget snapshot caching, real-time collaboration, and undo/redo.
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.ExecutionApi
import io.healthplatform.pulsequery.api.models.DashboardCreate
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.HttpConfig
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.TextConfig
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetReorderItem
import io.healthplatform.pulsequery.api.models.WidgetReorderRequest
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.core.undo.DashboardCommand
import io.healthplatform.pulsequery.core.undo.UndoRedoManager
import io.healthplatform.pulsequery.database.WidgetCacheStorage
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.CollaboratorPresence
import io.healthplatform.pulsequery.network.DashboardWebSocketRepository
import io.healthplatform.pulsequery.network.NetworkHealthRepository
import io.healthplatform.pulsequery.network.QueryCartRepository
import io.healthplatform.pulsequery.network.StagedQuery
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.floatOrNull

/**
 * Parsed visualization payload for a single widget on the dashboard.
 *
 * @property data Key-value series pairs for 2D charts and metrics.
 * @property tableColumns Ordered column names for tabular and heatmap visualizations.
 * @property tableRows Ordered string rows for tabular and heatmap visualizations.
 * @property textContent Markdown text content for TEXT widgets.
 * @property errorMessage Error message if execution failed for this widget.
 */
data class WidgetRenderState(
    val data: List<Pair<String, Float>> = emptyList(),
    val tableColumns: List<String> = emptyList(),
    val tableRows: List<List<String>> = emptyList(),
    val textContent: String? = null,
    val errorMessage: String? = null
)

/**
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.DashboardScreen].
 *
 * @property dashboards List of all dashboards accessible to the user.
 * @property activeDashboard Currently selected dashboard.
 * @property widgetDataMap Map of widget IDs to their parsed [WidgetRenderState].
 * @property isLoading Whether the dashboard list or batch refresh is currently loading.
 * @property errorMessage Top-level error message if dashboard loading or mutation failed.
 * @property filterDepartment Active global department filter, or null when unfiltered.
 * @property filterTimeRange Active global time-range filter, or null when unfiltered.
 * @property isOfflineSnapshot True when displaying cached offline widget snapshots.
 */
data class DashboardUiState(
    val dashboards: List<DashboardResponse> = emptyList(),
    val activeDashboard: DashboardResponse? = null,
    val widgetDataMap: Map<String, WidgetRenderState> = emptyMap(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val filterDepartment: String? = null,
    val filterTimeRange: String? = null,
    val isOfflineSnapshot: Boolean = false
)

/**
 * ViewModel managing state and business logic for the Dashboard screen.
 *
 * @property scope Coroutine scope used for asynchronous API and cache operations.
 * @property dashboardsApi Optional explicit [DashboardsApi] client for dashboard and widget CRUD.
 * @property executionApi Optional explicit [ExecutionApi] client for batch dashboard refresh execution.
 * @property webSocketRepository Optional explicit [DashboardWebSocketRepository] for real-time collaborator presence and widget updates.
 * @property networkHealthRepository Optional explicit [NetworkHealthRepository] monitoring database and backend health.
 * @property queryCartRepository Repository holding staged SQL queries.
 * @property widgetCacheProvider Provider returning the current [WidgetCacheStorage] instance.
 * @property tokenProvider Provider returning the current JWT token.
 * @property undoRedoManager Manager tracking undoable and redoable dashboard commands.
 */
class DashboardViewModel(
    private val scope: CoroutineScope,
    private val dashboardsApi: DashboardsApi? = null,
    private val executionApi: ExecutionApi? = null,
    private val webSocketRepository: DashboardWebSocketRepository? = null,
    private val networkHealthRepository: NetworkHealthRepository? = null,
    private val queryCartRepository: QueryCartRepository = AppContainer.queryCartRepository,
    private val widgetCacheProvider: () -> WidgetCacheStorage? = { AppContainer.widgetCacheStorage },
    private val tokenProvider: () -> String? = { AppContainer.currentToken },
    val undoRedoManager: UndoRedoManager = UndoRedoManager()
) {
    private val currentDashboardsApi: DashboardsApi
        get() = dashboardsApi ?: AppContainer.dashboardsApi

    private val currentExecutionApi: ExecutionApi
        get() = executionApi ?: AppContainer.executionApi

    private val currentWebSocketRepository: DashboardWebSocketRepository
        get() = webSocketRepository ?: AppContainer.dashboardWebSocketRepository

    private val currentNetworkHealthRepository: NetworkHealthRepository
        get() = networkHealthRepository ?: AppContainer.networkHealthRepository

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val _state = MutableStateFlow(DashboardUiState())

    /** Reactive [StateFlow] of the current [DashboardUiState]. */
    val state: StateFlow<DashboardUiState> = _state.asStateFlow()

    /** Reactive [StateFlow] of active collaborators on the current dashboard. */
    val collaborators: StateFlow<List<CollaboratorPresence>>
        get() = currentWebSocketRepository.activeCollaborators

    /** Reactive [StateFlow] of staged SQL queries in the query cart. */
    val cartItems: StateFlow<List<StagedQuery>> = queryCartRepository.stagedQueries

    /**
     * Collects remote widget update notifications from [DashboardWebSocketRepository]
     * until the calling coroutine is cancelled.
     */
    suspend fun observeRemoteWidgetUpdates() {
        currentWebSocketRepository.remoteWidgetUpdates.collect {
            loadDashboards()
        }
    }

    /**
     * Loads the user's dashboards and executes a single batch refresh for the active dashboard.
     * Falls back to cached widget execution results from [WidgetCacheStorage] when offline.
     *
     * @param errorPrefix Optional prefix for load error messages.
     */
    fun loadDashboards(errorPrefix: String = "Failed to load dashboards: ") {
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runCatchingPulseAsync {
                currentDashboardsApi.listDashboardsApiV1DashboardsGet().body()
            }.fold(
                onSuccess = { fetched -> onDashboardsLoaded(fetched) },
                onFailure = { e -> onDashboardsLoadFailed(e, errorPrefix) }
            )
            _state.update { it.copy(isLoading = false) }
        }
    }

    /**
     * Handles successful retrieval of [fetched] dashboards, connecting WebSocket presence and refreshing widgets.
     *
     * @param fetched List of dashboards returned by the backend.
     */
    private suspend fun onDashboardsLoaded(fetched: List<DashboardResponse>) {
        val currentActiveId = _state.value.activeDashboard?.id
        val resolvedActive = fetched.find { it.id == currentActiveId } ?: fetched.firstOrNull()
        _state.update {
            it.copy(
                dashboards = fetched,
                activeDashboard = resolvedActive,
                isOfflineSnapshot = false,
                errorMessage = null
            )
        }
        if (resolvedActive != null) {
            currentWebSocketRepository.connect(resolvedActive.id, tokenProvider())
            refreshActiveDashboardInternal(resolvedActive)
        } else {
            currentWebSocketRepository.disconnect()
            _state.update { it.copy(widgetDataMap = emptyMap()) }
        }
    }

    /**
     * Handles dashboard list retrieval failures by falling back to offline cached widgets if available.
     *
     * @param error Underlying failure [Throwable].
     * @param errorPrefix Prefix prepended to the error message when no offline cache exists.
     */
    private fun onDashboardsLoadFailed(error: Throwable, errorPrefix: String) {
        val currentActive = _state.value.activeDashboard
        val cached = if (currentActive != null) {
            widgetCacheProvider()?.getCachedWidgets(currentActive.id).orEmpty()
        } else {
            emptyList()
        }
        if (currentActive != null && cached.isNotEmpty()) {
            val restored = deserializeCachedDashboardWidgets(
                json = json,
                dashboard = currentActive,
                cachedJsonByWidgetId = cached.associate { it.widget_id to it.data_json }
            )
            _state.update { it.copy(isOfflineSnapshot = true, errorMessage = null, widgetDataMap = restored) }
        } else {
            _state.update { it.copy(errorMessage = errorPrefix + error.messageOrDefault("Unknown error")) }
        }
    }

    /**
     * Selects a dashboard as active and triggers a batch widget refresh.
     *
     * @param dashboard The [DashboardResponse] to activate.
     */
    fun selectDashboard(dashboard: DashboardResponse) {
        _state.update { it.copy(activeDashboard = dashboard) }
        currentWebSocketRepository.connect(dashboard.id, tokenProvider())
        scope.launch {
            refreshActiveDashboardInternal(dashboard)
        }
    }

    /**
     * Updates global department and time-range filters and refreshes the active dashboard's widget data
     * by passing the filters as `requestBody` to `refreshDashboardApiV1DashboardsDashboardIdRefreshPost`.
     *
     * @param department Department filter value, or null to clear.
     * @param timeRange Time-range filter value, or null to clear.
     */
    fun updateFilters(department: String?, timeRange: String?) {
        _state.update { it.copy(filterDepartment = department, filterTimeRange = timeRange) }
        val active = _state.value.activeDashboard ?: return
        scope.launch {
            refreshActiveDashboardInternal(active)
        }
    }

    /**
     * Resets all global filters and refreshes the active dashboard's widget data.
     */
    fun resetFilters() {
        updateFilters(null, null)
    }

    /**
     * Executes a single batch refresh request for all widgets in [dashboard], passing active global filters,
     * caching the executed result payloads into [WidgetCacheStorage], and updating [DashboardUiState.widgetDataMap].
     *
     * @param dashboard Target [DashboardResponse] to refresh.
     */
    suspend fun refreshActiveDashboardInternal(dashboard: DashboardResponse) {
        val widgets = dashboard.widgets.orEmpty()
        val textMap = extractTextWidgetStates(widgets)
        val executableWidgets = widgets.filterNot { it.type.equals("TEXT", ignoreCase = true) }
        if (executableWidgets.isEmpty()) {
            _state.update { it.copy(widgetDataMap = textMap) }
            return
        }

        val globalFilters = buildGlobalFilterPayload(_state.value)
        runCatchingPulseAsync {
            currentExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
                dashboardId = dashboard.id,
                requestBody = globalFilters
            ).body()
        }.fold(
            onSuccess = { payloadMap ->
                val executedMap = cacheAndParseExecutedWidgets(dashboard.id, executableWidgets, payloadMap)
                _state.update { it.copy(widgetDataMap = textMap + executedMap, isOfflineSnapshot = false) }
            },
            onFailure = { e ->
                handleDashboardRefreshFailure(dashboard, executableWidgets, textMap, e)
            }
        )
    }

    /**
     * Caches raw widget execution JSON payloads and parses them into [WidgetRenderState] instances.
     *
     * @param dashboardId Parent dashboard UUID.
     * @param executableWidgets List of non-text widgets that were executed.
     * @param payloadMap Map of widget IDs to raw execution [JsonElement] payloads.
     * @return Map of widget IDs to parsed [WidgetRenderState] instances.
     */
    private fun cacheAndParseExecutedWidgets(
        dashboardId: String,
        executableWidgets: List<WidgetResponse>,
        payloadMap: Map<String, JsonElement>
    ): Map<String, WidgetRenderState> {
        val cacheStorage = widgetCacheProvider()
        return executableWidgets.associate { widget ->
            val rawElement = payloadMap[widget.id]
            if (rawElement != null) {
                cacheStorage?.cacheWidget(widget.id, dashboardId, rawElement.toString())
                widget.id to parseWidgetExecutionElement(widget, rawElement)
            } else {
                widget.id to WidgetRenderState()
            }
        }
    }

    /**
     * Handles batch widget execution failures by restoring from [WidgetCacheStorage] or populating per-widget error states.
     *
     * @param dashboard Active dashboard whose refresh failed.
     * @param executableWidgets List of executable widgets on the dashboard.
     * @param textMap Pre-rendered states for static text widgets.
     * @param error Underlying failure [Throwable].
     */
    private fun handleDashboardRefreshFailure(
        dashboard: DashboardResponse,
        executableWidgets: List<WidgetResponse>,
        textMap: Map<String, WidgetRenderState>,
        error: Throwable
    ) {
        val cached = widgetCacheProvider()?.getCachedWidgets(dashboard.id).orEmpty()
        if (cached.isNotEmpty()) {
            val restored = deserializeCachedDashboardWidgets(
                json = json,
                dashboard = dashboard,
                cachedJsonByWidgetId = cached.associate { it.widget_id to it.data_json }
            )
            _state.update { it.copy(widgetDataMap = textMap + restored, isOfflineSnapshot = true) }
        } else {
            val errMap = executableWidgets.associate { w ->
                w.id to WidgetRenderState(errorMessage = error.messageOrDefault("Failed to load data"))
            }
            _state.update { it.copy(widgetDataMap = textMap + errMap) }
        }
    }

    /**
     * Parses a single widget execution JSON element into a [WidgetRenderState].
     *
     * @param widget Metadata of the executed widget.
     * @param element Raw JSON element returned by the execution API or offline cache.
     * @return Parsed [WidgetRenderState].
     */
    fun parseWidgetExecutionElement(widget: WidgetResponse, element: JsonElement): WidgetRenderState =
        parseExecutionElement(widget, element)

    /**
     * Creates a new dashboard with [name] and reloads the dashboard list.
     *
     * @param name Display name for the new dashboard.
     * @param errorPrefix Prefix for error messages on failure.
     */
    fun createDashboard(name: String, errorPrefix: String = "Failed to create dashboard: ") {
        if (name.isBlank()) return
        scope.launch {
            runCatchingPulseAsync {
                currentDashboardsApi.createDashboardApiV1DashboardsPost(DashboardCreate(name = name))
            }.fold(
                onSuccess = { loadDashboards() },
                onFailure = { e -> _state.update { it.copy(errorMessage = errorPrefix + e.messageOrDefault("Unknown error")) } }
            )
        }
    }

    /**
     * Deletes the dashboard with [id] and reloads the remaining dashboards.
     *
     * @param id UUID of the dashboard to delete.
     * @param errorPrefix Prefix for error messages on failure.
     */
    fun deleteDashboard(id: String, errorPrefix: String = "Failed to delete dashboard: ") {
        scope.launch {
            runCatchingPulseAsync {
                currentDashboardsApi.deleteDashboardApiV1DashboardsDashboardIdDelete(id)
            }.fold(
                onSuccess = {
                    _state.update { it.copy(activeDashboard = null) }
                    loadDashboards()
                },
                onFailure = { e -> _state.update { it.copy(errorMessage = errorPrefix + e.messageOrDefault("Unknown error")) } }
            )
        }
    }

    /**
     * Deletes a widget using an undoable [DashboardCommand] that re-creates the deleted widget
     * via `createWidgetApiV1DashboardsDashboardIdWidgetsPost` with its saved [WidgetIn] configuration on undo.
     *
     * @param widget The [WidgetResponse] to delete.
     * @param errorPrefix Prefix for error messages on failure.
     */
    fun deleteWidgetWithUndo(widget: WidgetResponse, errorPrefix: String = "Failed to delete widget: ") {
        val savedWidgetIn = buildWidgetInFromResponse(widget)
        var currentWidgetId = widget.id
        scope.launch {
            undoRedoManager.executeCommand(object : DashboardCommand {
                override val description: String = "Delete Widget ${widget.title}"

                override suspend fun execute(): Result<Unit> = runCatchingPulseAsync {
                    currentDashboardsApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(currentWidgetId)
                    loadDashboards()
                }.onFailure { e ->
                    _state.update { it.copy(errorMessage = errorPrefix + e.messageOrDefault("Unknown error")) }
                }

                override suspend fun undo(): Result<Unit> = runCatchingPulseAsync {
                    val recreated = currentDashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(
                        dashboardId = widget.dashboardId,
                        widgetIn = savedWidgetIn
                    ).body()
                    currentWidgetId = recreated.id
                    loadDashboards()
                }.onFailure { e ->
                    _state.update { it.copy(errorMessage = "Failed to restore widget: ${e.message}") }
                }
            })
        }
    }

    /**
     * Converts an existing [WidgetResponse] into a [WidgetIn] payload so it can be re-created on undo.
     *
     * @param widget The [WidgetResponse] to convert.
     * @return Reconstructible [WidgetIn] instance.
     */
    fun buildWidgetInFromResponse(widget: WidgetResponse): WidgetIn =
        convertResponseToWidgetIn(widget)

    /**
     * Reorders a widget from [currentIndex] to [targetIndex] and persists the new order to the backend.
     *
     * @param currentIndex Original index of the widget.
     * @param targetIndex New index of the widget.
     */
    fun reorderWidget(currentIndex: Int, targetIndex: Int) {
        val currentDb = _state.value.activeDashboard ?: return
        val currentWidgets = currentDb.widgets.orEmpty().toMutableList()
        if (currentIndex !in currentWidgets.indices || targetIndex !in currentWidgets.indices) return
        val moved = currentWidgets.removeAt(currentIndex)
        currentWidgets.add(targetIndex, moved)
        _state.update { it.copy(activeDashboard = currentDb.copy(widgets = currentWidgets)) }
        scope.launch {
            runCatchingPulseAsync {
                val req = WidgetReorderRequest(
                    items = currentWidgets.mapIndexed { idx, w -> WidgetReorderItem(id = w.id, order = idx) }
                )
                currentDashboardsApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost(currentDb.id, req)
            }.onFailure { e ->
                _state.update { it.copy(errorMessage = "Failed to persist widget order: ${e.message}") }
            }
        }
    }

    /** Executes an undo operation on [undoRedoManager]. */
    fun undo() {
        scope.launch { undoRedoManager.undo() }
    }

    /** Executes a redo operation on [undoRedoManager]. */
    fun redo() {
        scope.launch { undoRedoManager.redo() }
    }

    /** Refreshes backend health status and reloads dashboards. */
    fun retryHealthAndLoad() {
        currentNetworkHealthRepository.refreshHealth()
        loadDashboards()
    }

    /** Disconnects the real-time collaboration WebSocket when the screen is disposed. */
    fun onCleared() {
        currentWebSocketRepository.disconnect()
    }
}

/**
 * Extracts a string primitive property from [config] or returns null.
 *
 * @param config Widget configuration JSON object.
 * @param key Property key to look up.
 * @return String value or null if absent.
 */
private fun extractConfigString(config: JsonObject, key: String): String? {
    val prim = config[key] as? JsonPrimitive ?: return null
    return prim.content
}

/**
 * Extracts the Markdown text body from a `TEXT` [widget] configuration.
 *
 * @param widget Target [WidgetResponse].
 * @return Extracted text content string.
 */
private fun extractTextWidgetContent(widget: WidgetResponse): String =
    extractConfigString(widget.config, "content")
        ?: extractConfigString(widget.config, "text")
            .orEmpty()

/**
 * Builds [WidgetRenderState] entries for all static `TEXT` widgets in [widgets].
 *
 * @param widgets All widgets belonging to the active dashboard.
 * @return Map of text widget IDs to their [WidgetRenderState].
 */
private fun extractTextWidgetStates(widgets: List<WidgetResponse>): Map<String, WidgetRenderState> {
    return widgets
        .filter { it.type.equals("TEXT", ignoreCase = true) }
        .associate { w ->
            w.id to WidgetRenderState(textContent = extractTextWidgetContent(w))
        }
}

/**
 * Constructs the global filter request map from [state].
 *
 * @param state Current [DashboardUiState].
 * @return Map of filter keys to [JsonElement] values.
 */
private fun buildGlobalFilterPayload(state: DashboardUiState): Map<String, JsonElement> {
    return buildMap {
        state.filterDepartment?.takeIf { it.isNotBlank() }?.let {
            put("department", JsonPrimitive(it))
        }
        state.filterTimeRange?.takeIf { it.isNotBlank() }?.let {
            put("time_range", JsonPrimitive(it))
        }
    }
}

/**
 * Parses a raw execution [element] for [widget] into tabular and chart series data.
 *
 * @param widget Metadata of the executed widget.
 * @param element Raw JSON execution payload.
 * @return Populated [WidgetRenderState].
 */
private fun parseExecutionElement(widget: WidgetResponse, element: JsonElement): WidgetRenderState {
    val obj = element as? JsonObject ?: return WidgetRenderState()
    val errorMsg = extractExecutionError(obj)
    if (errorMsg != null) {
        return WidgetRenderState(errorMessage = errorMsg)
    }

    val dataArray = obj["data"] as? JsonArray ?: return WidgetRenderState()
    val jsonRows = dataArray.filterIsInstance<JsonObject>()
    if (jsonRows.isEmpty()) return WidgetRenderState()

    val cols = jsonRows.first().keys.toList()
    val xKey = resolveAxisKey(extractConfigString(widget.config, "xKey"), cols, 0, "label")
    val yKey = resolveAxisKey(extractConfigString(widget.config, "yKey"), cols, 1, "value")

    val rows = jsonRows.map { rowObj ->
        cols.map { k -> extractConfigString(rowObj, k).orEmpty() }
    }
    val parsedData = jsonRows.map { rowObj ->
        val label = extractConfigString(rowObj, xKey) ?: "Unknown"
        val value = (rowObj[yKey] as? JsonPrimitive)?.floatOrNull ?: 0f
        label to value
    }

    return WidgetRenderState(
        data = parsedData,
        tableColumns = cols,
        tableRows = rows
    )
}

/**
 * Extracts a non-blank execution error string from [obj], if present.
 *
 * @param obj Execution response JSON object.
 * @return Error message string, or null if no error occurred.
 */
private fun extractExecutionError(obj: JsonObject): String? {
    val errorPrim = obj["error"] as? JsonPrimitive ?: return null
    return if (errorPrim.isString && errorPrim.content.isNotBlank()) errorPrim.content else null
}

/**
 * Resolves the column key to use for a chart axis from [configuredKey] or positional fallbacks in [cols].
 *
 * @param configuredKey Explicitly configured axis column name, if any.
 * @param cols Available result column names.
 * @param fallbackIndex Positional column index fallback.
 * @param defaultKey Final fallback column name when [cols] is empty.
 * @return Resolved column name.
 */
private fun resolveAxisKey(
    configuredKey: String?,
    cols: List<String>,
    fallbackIndex: Int,
    defaultKey: String
): String {
    if (configuredKey != null && cols.contains(configuredKey)) {
        return configuredKey
    }
    return cols.getOrNull(fallbackIndex) ?: cols.firstOrNull() ?: defaultKey
}

/**
 * Deserializes cached JSON snapshots for all widgets in [dashboard].
 *
 * @param json Serializer instance used to parse cached JSON strings.
 * @param dashboard Active dashboard metadata.
 * @param cachedJsonByWidgetId Map of widget IDs to cached JSON strings.
 * @return Map of widget IDs to restored [WidgetRenderState] instances.
 */
private fun deserializeCachedDashboardWidgets(
    json: Json,
    dashboard: DashboardResponse,
    cachedJsonByWidgetId: Map<String, String>
): Map<String, WidgetRenderState> {
    val widgets = dashboard.widgets.orEmpty()
    return widgets.associate { widget ->
        if (widget.type.equals("TEXT", ignoreCase = true)) {
            widget.id to WidgetRenderState(textContent = extractTextWidgetContent(widget))
        } else {
            val rawJson = cachedJsonByWidgetId[widget.id]
            val parsed = if (rawJson == null) {
                WidgetRenderState()
            } else {
                parseExecutionElement(widget, json.parseToJsonElement(rawJson))
            }
            widget.id to parsed
        }
    }
}

/**
 * Converts a [WidgetResponse] into a polymorphic [WidgetIn] creation payload for undo restoration.
 *
 * @param widget Source [WidgetResponse] instance.
 * @return Corresponding [WidgetIn] payload.
 */
private fun convertResponseToWidgetIn(widget: WidgetResponse): WidgetIn {
    return when (widget.type.uppercase()) {
        "TEXT" -> {
            WidgetIn.Text(
                title = widget.title,
                type = "TEXT",
                visualization = widget.visualization,
                config = TextConfig(content = extractTextWidgetContent(widget))
            )
        }
        "HTTP" -> {
            val url = extractConfigString(widget.config, "url") ?: "https://localhost"
            val methodRaw = extractConfigString(widget.config, "method") ?: "GET"
            val methodEnum = HttpConfig.Method.entries.firstOrNull {
                it.value.equals(methodRaw, ignoreCase = true)
            } ?: HttpConfig.Method.GET
            WidgetIn.Http(
                title = widget.title,
                type = "HTTP",
                visualization = widget.visualization,
                config = HttpConfig(url = url, method = methodEnum)
            )
        }
        else -> {
            val query = extractConfigString(widget.config, "query") ?: "SELECT 1"
            WidgetIn.Sql(
                title = widget.title,
                type = "SQL",
                visualization = widget.visualization,
                config = SqlConfig(query = query)
            )
        }
    }
}
