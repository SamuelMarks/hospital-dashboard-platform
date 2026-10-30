/**
 * Pure domain mapper and JSON parser for dashboard widgets (`DashboardWidgetParser.kt`).
 *
 * Encapsulates JSON payload parsing (`parseExecutionElement`), axis inference (`resolveNumericYKey`),
 * offline snapshot deserialization (`deserializeCachedDashboardWidgets`), and `WidgetIn` reconstruction
 * (`convertResponseToWidgetIn`) outside of [DashboardViewModel].
 */
package io.healthplatform.pulsequery.ui.screens.dashboard

import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.HttpConfig
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.TextConfig
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.core.model.ProcessorId
import io.healthplatform.pulsequery.core.model.VisualizationType
import io.healthplatform.pulsequery.core.model.WidgetSourceType
import io.healthplatform.pulsequery.core.model.extractWidgetSqlConfig
import io.healthplatform.pulsequery.core.model.readJsonConfigString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.floatOrNull

/**
 * Extracts a string primitive property from [config] or returns null.
 *
 * @param config Widget configuration JSON object.
 * @param key Property key to look up.
 * @return String value or null if absent.
 */
internal fun extractConfigString(config: JsonObject, key: String): String? =
    readJsonConfigString(config, key)

/**
 * Extracts the Markdown text body from a `TEXT` [widget] configuration.
 *
 * @param widget Target [WidgetResponse].
 * @return Extracted text content string.
 */
internal fun extractTextWidgetContent(widget: WidgetResponse): String =
    extractConfigString(widget.config, "content")
        ?: extractConfigString(widget.config, "text")
            .orEmpty()

/**
 * Builds [WidgetRenderState] entries for all static `TEXT` widgets in [widgets].
 *
 * @param widgets All widgets belonging to the active dashboard.
 * @return Map of text widget IDs to their [WidgetRenderState].
 */
internal fun extractTextWidgetStates(widgets: List<WidgetResponse>): Map<String, WidgetRenderState> {
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
internal fun buildGlobalFilterPayload(state: DashboardUiState): Map<String, JsonElement> {
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
 * Extracts initial natural-text and processor metadata from [widget] and optional execution [obj].
 *
 * @param widget Metadata of the executed widget.
 * @param obj Optional JSON execution object.
 * @return Base [WidgetRenderState] populated with natural-text and processor metadata.
 */
internal fun resolveBaseRenderState(widget: WidgetResponse, obj: JsonObject?): WidgetRenderState {
    val sqlCfg = extractWidgetSqlConfig(widget.config)
    if (obj == null) {
        return WidgetRenderState(
            allowNaturalText = sqlCfg.allowNaturalText,
            processor = sqlCfg.processor,
            naturalTextPrompt = sqlCfg.naturalTextPrompt
        )
    }
    val genSql = extractConfigString(obj, "generated_sql")
    val usedProc = extractConfigString(obj, "processor_used")?.let { ProcessorId(it) } ?: sqlCfg.processor
    val usedText = extractConfigString(obj, "natural_text") ?: sqlCfg.naturalTextPrompt
    return WidgetRenderState(
        allowNaturalText = sqlCfg.allowNaturalText,
        processor = usedProc,
        naturalTextPrompt = usedText,
        generatedSql = genSql
    )
}

/**
 * Parses a raw execution [element] for [widget] into tabular and chart series data.
 *
 * @param widget Metadata of the executed widget.
 * @param element Raw JSON execution payload.
 * @return Populated [WidgetRenderState].
 */
internal fun parseExecutionElement(widget: WidgetResponse, element: JsonElement): WidgetRenderState {
    val obj = element as? JsonObject ?: return resolveBaseRenderState(widget, null)
    val baseState = resolveBaseRenderState(widget, obj)

    val errorMsg = extractExecutionError(obj)
    if (errorMsg != null) {
        return baseState.copy(errorMessage = errorMsg)
    }

    val dataArray = obj["data"] as? JsonArray ?: return baseState
    val jsonRows = dataArray.filterIsInstance<JsonObject>()
    if (jsonRows.isEmpty()) {
        return baseState
    }

    val firstRow = jsonRows.first()
    val cols = firstRow.keys.toList()
    val xKey = resolveAxisKey(extractConfigString(widget.config, "xKey"), cols, 0, "label")
    val yKey = resolveNumericYKey(extractConfigString(widget.config, "yKey"), cols, firstRow)

    val rows = jsonRows.map { rowObj ->
        cols.map { k -> extractConfigString(rowObj, k).orEmpty() }
    }
    val parsedData = jsonRows.map { rowObj ->
        val label = extractRowLabel(rowObj, xKey, cols.size)
        val value = (rowObj[yKey] as? JsonPrimitive)?.floatOrNull ?: 0f
        label to value
    }

    return baseState.copy(
        data = parsedData,
        tableColumns = cols,
        tableRows = rows
    )
}

/**
 * Resolves the Y-axis numeric value column key from [configuredYKey], [cols], and [firstRow].
 *
 * @param configuredYKey Explicitly configured Y-axis column name, if any.
 * @param cols Available result column names.
 * @param firstRow First JSON row object used to inspect numeric column values.
 * @return Resolved Y-axis column name.
 */
internal fun resolveNumericYKey(
    configuredYKey: String?,
    cols: List<String>,
    firstRow: JsonObject
): String {
    if (configuredYKey != null && cols.contains(configuredYKey)) {
        return configuredYKey
    }
    return cols.drop(1).firstOrNull { (firstRow[it] as? JsonPrimitive)?.floatOrNull != null }
        ?: resolveAxisKey(null, cols, 1, "value")
}

/**
 * Extracts a chart series label from [rowObj] for [xKey].
 *
 * @param rowObj Current JSON row object.
 * @param xKey Resolved X-axis column key.
 * @param colCount Total number of columns in the result set.
 * @return Series label string.
 */
internal fun extractRowLabel(rowObj: JsonObject, xKey: String, colCount: Int): String =
    if (colCount == 1) xKey else (extractConfigString(rowObj, xKey) ?: "Unknown")

/**
 * Extracts a non-blank execution error string from [obj], if present.
 *
 * @param obj Execution response JSON object.
 * @return Error message string, or null if no error occurred.
 */
internal fun extractExecutionError(obj: JsonObject): String? {
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
internal fun resolveAxisKey(
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
internal fun deserializeCachedDashboardWidgets(
    json: Json,
    dashboard: DashboardResponse,
    cachedJsonByWidgetId: Map<String, String>
): Map<String, WidgetRenderState> {
    val widgets = dashboard.widgets.orEmpty()
    return widgets.associate { widget ->
        if (WidgetSourceType.fromWire(widget.type) == WidgetSourceType.TEXT) {
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
 * Resolves the display subtitle or caption for [widget] from top-level [WidgetResponse.subtitle],
 * falling back to `config["subtitle"]` or `config["description"]`.
 *
 * @param widget Target [WidgetResponse].
 * @return Trimmed non-empty subtitle string, or null if absent.
 */
internal fun extractWidgetSubtitle(widget: WidgetResponse): String? =
    listOf(
        widget.subtitle,
        extractConfigString(widget.config, "subtitle"),
        extractConfigString(widget.config, "description")
    ).firstOrNull { !it.isNullOrBlank() }?.trim()

/**
 * Converts a [WidgetResponse] into a polymorphic [WidgetIn] creation payload for undo restoration.
 *
 * @param widget Source [WidgetResponse] instance.
 * @return Corresponding [WidgetIn] payload.
 */
internal fun convertResponseToWidgetIn(widget: WidgetResponse): WidgetIn {
    val resolvedViz = VisualizationType.fromWire(widget.visualization).wireValue
    val resolvedSub = extractWidgetSubtitle(widget)
    return when (WidgetSourceType.fromWire(widget.type)) {
        WidgetSourceType.TEXT -> {
            WidgetIn.Text(
                title = widget.title,
                subtitle = resolvedSub,
                type = WidgetSourceType.TEXT.wireValue,
                visualization = resolvedViz,
                config = TextConfig(content = extractTextWidgetContent(widget), subtitle = resolvedSub)
            )
        }
        WidgetSourceType.HTTP -> {
            val url = extractConfigString(widget.config, "url") ?: "https://localhost"
            val methodRaw = extractConfigString(widget.config, "method") ?: "GET"
            val methodEnum = HttpConfig.Method.entries.firstOrNull {
                it.value.equals(methodRaw, ignoreCase = true)
            } ?: HttpConfig.Method.GET
            WidgetIn.Http(
                title = widget.title,
                subtitle = resolvedSub,
                type = WidgetSourceType.HTTP.wireValue,
                visualization = resolvedViz,
                config = HttpConfig(url = url, method = methodEnum, subtitle = resolvedSub)
            )
        }
        WidgetSourceType.SQL -> {
            val query = extractConfigString(widget.config, "query") ?: "SELECT 1"
            WidgetIn.Sql(
                title = widget.title,
                subtitle = resolvedSub,
                type = WidgetSourceType.SQL.wireValue,
                visualization = resolvedViz,
                config = SqlConfig(query = query, subtitle = resolvedSub)
            )
        }
    }
}
