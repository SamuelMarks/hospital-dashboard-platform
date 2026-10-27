/**
 * Wizard ViewModel module coordinating template fetching and multi-modal widget authoring.
 */
package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.TemplatesApi
import io.healthplatform.pulsequery.api.models.HttpConfig
import io.healthplatform.pulsequery.api.models.ModelInfo
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.TemplateResponse
import io.healthplatform.pulsequery.api.models.TextConfig
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.model.DashboardId
import io.healthplatform.pulsequery.core.model.ProcessorCategory
import io.healthplatform.pulsequery.core.model.ProcessorId
import io.healthplatform.pulsequery.core.model.ProcessorSelectionOption
import io.healthplatform.pulsequery.core.model.VisualizationType
import io.healthplatform.pulsequery.core.model.WidgetSourceType
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * ViewModel managing state and operations for the Widget Creation Wizard and Template Marketplace.
 *
 * @property dashboardId The identifier of the dashboard to which the new widget will be attached.
 * @property scope Coroutine scope used for executing asynchronous network requests.
 * @property templatesApi API client for querying template configurations.
 * @property dashboardsApi API client for persisting newly created widgets.
 * @property aiApi Optional API client for querying available query processors (`SQL`, Ollama, `any-llm`).
 */
class WizardViewModel(
    val dashboardId: String,
    private val scope: CoroutineScope,
    private val templatesApi: TemplatesApi? = null,
    private val dashboardsApi: DashboardsApi? = null,
    private val aiApi: AiApi? = null
) {
    private val currentTemplatesApi: TemplatesApi
        get() = templatesApi ?: AppContainer.templatesApi

    private val currentDashboardsApi: DashboardsApi
        get() = dashboardsApi ?: AppContainer.dashboardsApi

    private val currentAiApi: AiApi
        get() = aiApi ?: AppContainer.aiApi

    private val _state = MutableStateFlow<WizardState>(WizardState.Loading)

    /** StateFlow exposing current immutable wizard state to observing UI layers. */
    val state: StateFlow<WizardState> = _state.asStateFlow()

    private var allTemplates: List<TemplateResponse> = emptyList()
    private var allCategories: List<String> = emptyList()
    private var cachedProcessors: List<ProcessorSelectionOption> = listOf(ProcessorSelectionOption.SQL_DEFAULT)

    init {
        loadTemplates()
        if (aiApi != null) {
            loadAvailableProcessors()
        }
    }

    /**
     * Loads selectable query processors (`SQL [no model]`, Ollama models, and `any-llm` models) via [AiApi].
     */
    fun loadAvailableProcessors() {
        scope.launch {
            runCatchingPulseAsync {
                currentAiApi.listAvailableModelsApiV1AiModelsGet(includeSql = true, discoverOllama = true)
                    .asResult()
                    .getOrThrow()
            }.fold(
                onSuccess = { models ->
                    val mapped = models.map { mapModelInfoToProcessorSelection(it) }
                    cachedProcessors = if (mapped.any { it.id == ProcessorId.SQL_NO_MODEL }) {
                        mapped
                    } else {
                        listOf(ProcessorSelectionOption.SQL_DEFAULT) + mapped
                    }
                    when (val current = _state.value) {
                        is WizardState.CustomWidgetConfiguration -> {
                            _state.value = current.copy(availableProcessors = cachedProcessors)
                        }
                        is WizardState.ParameterConfiguration -> {
                            _state.value = current.copy(availableProcessors = cachedProcessors)
                        }
                        else -> Unit
                    }
                },
                onFailure = {
                    cachedProcessors = listOf(ProcessorSelectionOption.SQL_DEFAULT)
                }
            )
        }
    }

    /**
     * Loads available widget templates from the backend templates API.
     */
    fun loadTemplates() {
        _state.value = WizardState.Loading
        scope.launch {
            runCatchingPulseAsync {
                currentTemplatesApi.listTemplatesApiV1TemplatesGet(limit = 100).asResult().getOrThrow()
            }.fold(
                onSuccess = { templates ->
                    allTemplates = templates
                    allCategories = allTemplates.map { it.category }.distinct().sorted()
                    _state.value = WizardState.TemplateSelection(
                        templates = allTemplates,
                        categories = allCategories,
                        selectedCategory = null,
                        searchQuery = "",
                        filteredTemplates = allTemplates
                    )
                },
                onFailure = { e ->
                    _state.value = WizardState.Error(e.messageOrDefault(UiErrorKey.LOAD_TEMPLATES))
                }
            )
        }
    }

    /**
     * Filters displayed templates by category.
     *
     * @param category The selected category to filter by, or null for all.
     */
    fun selectCategory(category: String?) {
        val current = _state.value as? WizardState.TemplateSelection ?: return
        val filtered = filterWizardTemplates(allTemplates, category, current.searchQuery)
        _state.value = current.copy(selectedCategory = category, filteredTemplates = filtered)
    }

    /**
     * Filters displayed templates by search query.
     *
     * @param query Search query text to filter by.
     */
    fun updateSearchQuery(query: String) {
        val current = _state.value as? WizardState.TemplateSelection ?: return
        val filtered = filterWizardTemplates(allTemplates, current.selectedCategory, query)
        _state.value = current.copy(searchQuery = query, filteredTemplates = filtered)
    }

    /**
     * Selects a template to begin parameter configuration.
     *
     * @param template The template selected by the user.
     */
    fun selectTemplate(template: TemplateResponse) {
        val fields = extractParameterFields(template.parametersSchema)
        val initialValues = fields.associate { it.key to it.defaultValue }
        val defaultVis = when (template.category.lowercase()) {
            "census", "availability" -> VisualizationType.BAR_CHART.wireValue
            "bottlenecks", "utilization" -> VisualizationType.LINE_CHART.wireValue
            else -> VisualizationType.TABLE.wireValue
        }

        _state.value = WizardState.ParameterConfiguration(
            template = template,
            widgetTitle = template.title,
            visualization = defaultVis,
            parameterFields = fields,
            parameterValues = initialValues,
            fieldErrors = emptyMap(),
            availableProcessors = cachedProcessors
        )
    }

    /**
     * Transitions wizard into custom widget configuration mode (SQL, HTTP, or TEXT).
     *
     * @param type Source type identifier ("SQL", "HTTP", or "TEXT").
     */
    fun startCustomWidget(type: String) {
        val sourceType = WidgetSourceType.fromWire(type)
        val defaultViz = if (sourceType == WidgetSourceType.TEXT) {
            VisualizationType.MARKDOWN.wireValue
        } else {
            VisualizationType.TABLE.wireValue
        }
        _state.value = WizardState.CustomWidgetConfiguration(
            creationType = sourceType.wireValue,
            widgetTitle = "Custom $type Widget",
            visualization = defaultViz,
            availableProcessors = cachedProcessors
        )
    }

    /**
     * Updates whether the widget being configured allows user natural text entry on the dashboard.
     *
     * @param enabled True when natural text input is enabled.
     */
    fun updateAllowNaturalText(enabled: Boolean) {
        when (val current = _state.value) {
            is WizardState.CustomWidgetConfiguration -> {
                _state.value = current.copy(allowNaturalText = enabled, fieldErrors = current.fieldErrors - "content")
            }
            is WizardState.ParameterConfiguration -> {
                _state.value = current.copy(allowNaturalText = enabled)
            }
            else -> Unit
        }
    }

    /**
     * Updates the selected processor (`SQL [no model]`, Ollama model, or `any-llm` model).
     *
     * @param processorId Selected [ProcessorId].
     */
    fun selectProcessor(processorId: ProcessorId) {
        when (val current = _state.value) {
            is WizardState.CustomWidgetConfiguration -> {
                _state.value = current.copy(selectedProcessor = processorId)
            }
            is WizardState.ParameterConfiguration -> {
                _state.value = current.copy(selectedProcessor = processorId)
            }
            else -> Unit
        }
    }

    /**
     * Updates the default natural text prompt for the widget being configured.
     *
     * @param prompt Default natural language prompt or SQL string.
     */
    fun updateNaturalTextPrompt(prompt: String) {
        when (val current = _state.value) {
            is WizardState.CustomWidgetConfiguration -> {
                _state.value = current.copy(naturalTextPrompt = prompt, fieldErrors = current.fieldErrors - "content")
            }
            is WizardState.ParameterConfiguration -> {
                _state.value = current.copy(naturalTextPrompt = prompt)
            }
            else -> Unit
        }
    }

    /**
     * Updates the custom placeholder text for the widget's natural text input field.
     *
     * @param placeholder Placeholder string.
     */
    fun updatePlaceholderText(placeholder: String) {
        when (val current = _state.value) {
            is WizardState.CustomWidgetConfiguration -> {
                _state.value = current.copy(placeholderText = placeholder)
            }
            is WizardState.ParameterConfiguration -> {
                _state.value = current.copy(placeholderText = placeholder)
            }
            else -> Unit
        }
    }

    /**
     * Updates the custom widget title in custom creation mode.
     *
     * @param title New title string.
     */
    fun updateCustomWidgetTitle(title: String) {
        val current = _state.value as? WizardState.CustomWidgetConfiguration ?: return
        _state.value = current.copy(widgetTitle = title, fieldErrors = current.fieldErrors - "title")
    }

    /**
     * Updates the query, URL, or text content in custom creation mode.
     *
     * @param content New content string.
     */
    fun updateCustomWidgetContent(content: String) {
        val current = _state.value as? WizardState.CustomWidgetConfiguration ?: return
        _state.value = current.copy(queryOrUrlOrContent = content, fieldErrors = current.fieldErrors - "content")
    }

    /**
     * Updates the selected visualization mode for a custom widget.
     *
     * @param viz Visualization identifier (e.g. table, barchart).
     */
    fun updateCustomWidgetViz(viz: String) {
        val current = _state.value as? WizardState.CustomWidgetConfiguration ?: return
        _state.value = current.copy(visualization = viz)
    }

    /**
     * Updates the HTTP method verb for an HTTP custom widget.
     *
     * @param method HTTP method name (e.g. GET, POST).
     */
    fun updateCustomWidgetHttpMethod(method: String) {
        val current = _state.value as? WizardState.CustomWidgetConfiguration ?: return
        _state.value = current.copy(httpMethod = method)
    }

    /**
     * Submits a newly authored custom widget to the backend API.
     *
     * @param onSuccess Callback invoked with the created [WidgetResponse].
     */
    fun submitCustomWidget(onSuccess: (WidgetResponse) -> Unit) {
        val current = _state.value as? WizardState.CustomWidgetConfiguration ?: return
        val errors = validateCustomWidgetConfig(current)
        if (errors.isNotEmpty()) {
            _state.value = current.copy(fieldErrors = errors)
            return
        }
        persistWidget(buildCustomWidgetPayload(current), onSuccess)
    }

    /**
     * Updates an individual parameter value for the active template.
     *
     * @param key The parameter identifier.
     * @param value The updated value entered by the user.
     */
    fun updateParameterValue(key: String, value: String) {
        val current = _state.value as? WizardState.ParameterConfiguration ?: return
        _state.value = current.copy(
            parameterValues = current.parameterValues + (key to value),
            fieldErrors = current.fieldErrors - key
        )
    }

    /**
     * Updates the custom widget title.
     *
     * @param title The new widget title text.
     */
    fun updateWidgetTitle(title: String) {
        val current = _state.value as? WizardState.ParameterConfiguration ?: return
        _state.value = current.copy(widgetTitle = title, fieldErrors = current.fieldErrors - "title")
    }

    /**
     * Updates the selected visualization format.
     *
     * @param visualization The visualization ID (e.g. table, bar_chart, line_chart).
     */
    fun updateVisualization(visualization: String) {
        val current = _state.value as? WizardState.ParameterConfiguration ?: return
        _state.value = current.copy(visualization = visualization)
    }

    /**
     * Navigates back from parameter configuration to template selection.
     */
    fun backToTemplates() {
        val currentState = _state.value
        val currentCategory = if (currentState is WizardState.ParameterConfiguration) {
            currentState.template.category
        } else {
            null
        }
        _state.value = WizardState.TemplateSelection(
            templates = allTemplates,
            categories = allCategories,
            selectedCategory = currentCategory,
            searchQuery = "",
            filteredTemplates = filterWizardTemplates(allTemplates, currentCategory, "")
        )
    }

    /**
     * Submits the configured widget to the backend API.
     *
     * @param onSuccess Callback invoked when the widget has been created successfully.
     */
    fun submitWidget(onSuccess: (WidgetResponse) -> Unit) {
        val current = _state.value as? WizardState.ParameterConfiguration ?: return
        val errors = validateTemplateParameterConfig(current)
        if (errors.isNotEmpty()) {
            _state.value = current.copy(fieldErrors = errors)
            return
        }
        val renderedSql = substituteParameters(
            templateSql = current.template.sqlTemplate,
            parameters = current.parameterValues,
            fields = current.parameterFields
        )
        val widgetIn = WidgetIn.Sql(
            title = current.widgetTitle.trim(),
            type = WidgetSourceType.SQL.wireValue,
            visualization = current.visualization,
            config = SqlConfig(
                query = renderedSql,
                allowNaturalText = current.allowNaturalText,
                processor = current.selectedProcessor.value,
                naturalTextPrompt = current.naturalTextPrompt.trim().takeIf { it.isNotEmpty() },
                placeholderText = current.placeholderText.trim().takeIf { it.isNotEmpty() }
            )
        )
        persistWidget(widgetIn, onSuccess)
    }

    /**
     * Persists the authored [widgetIn] to the backend dashboard API and updates [state].
     *
     * @param widgetIn Polymorphic widget creation payload.
     * @param onSuccess Callback invoked with the persisted [WidgetResponse].
     */
    private fun persistWidget(widgetIn: WidgetIn, onSuccess: (WidgetResponse) -> Unit) {
        _state.value = WizardState.Submitting()
        scope.launch {
            runCatchingPulseAsync {
                currentDashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(
                    dashboardId = dashboardId,
                    widgetIn = widgetIn
                ).asResult().getOrThrow()
            }.fold(
                onSuccess = { created ->
                    _state.value = WizardState.Success(created)
                    onSuccess(created)
                },
                onFailure = { e ->
                    _state.value = WizardState.Error(e.messageOrDefault(UiErrorKey.CREATE_WIDGET))
                }
            )
        }
    }

    /**
     * Extracts structured parameter fields from a JSON schema object.
     *
     * @param schema The JSON Schema object describing template parameters.
     * @return List of extracted and validated [ParameterField] instances.
     */
    fun extractParameterFields(schema: JsonObject?): List<ParameterField> =
        extractSchemaParameterFields(schema)

    /**
     * Substitutes validated parameter values into handlebars-style placeholders within the SQL template,
     * escaping single quotes to prevent SQL syntax injection.
     *
     * @param templateSql Raw SQL containing {{placeholder}} tokens.
     * @param parameters Map of token names to user-provided string values.
     * @param fields Optional list of [ParameterField] definitions for type-aware formatting.
     * @return Rendered SQL string with all tokens substituted safely.
     */
    fun substituteParameters(
        templateSql: String,
        parameters: Map<String, String>,
        fields: List<ParameterField> = emptyList()
    ): String = substituteSqlParameters(templateSql, parameters, fields)
}

/**
 * Validates required fields on a [WizardState.CustomWidgetConfiguration].
 *
 * @param current Active custom widget configuration state.
 * @return Map of field names to validation error messages.
 */
private fun validateCustomWidgetConfig(
    current: WizardState.CustomWidgetConfiguration
): Map<String, String> {
    val errors = mutableMapOf<String, String>()
    if (current.widgetTitle.isBlank()) {
        errors["title"] = "Title is required"
    }
    val isSqlWithNaturalText = WidgetSourceType.fromWire(current.creationType) == WidgetSourceType.SQL &&
        current.allowNaturalText
    if (!isSqlWithNaturalText && current.queryOrUrlOrContent.isBlank()) {
        errors["content"] = "Query/URL/Content cannot be empty"
    }
    return errors
}

/**
 * Constructs a polymorphic [WidgetIn] payload from [current] custom widget configuration.
 *
 * @param current Validated custom widget configuration state.
 * @return Constructed [WidgetIn] payload.
 */
private fun buildCustomWidgetPayload(
    current: WizardState.CustomWidgetConfiguration
): WidgetIn {
    return when (WidgetSourceType.fromWire(current.creationType)) {
        WidgetSourceType.TEXT -> WidgetIn.Text(
            title = current.widgetTitle.trim(),
            type = WidgetSourceType.TEXT.wireValue,
            visualization = current.visualization,
            config = TextConfig(content = current.queryOrUrlOrContent)
        )
        WidgetSourceType.HTTP -> {
            val methodEnum = HttpConfig.Method.entries.firstOrNull {
                it.value.equals(current.httpMethod, ignoreCase = true)
            } ?: HttpConfig.Method.GET
            WidgetIn.Http(
                title = current.widgetTitle.trim(),
                type = WidgetSourceType.HTTP.wireValue,
                visualization = current.visualization,
                config = HttpConfig(url = current.queryOrUrlOrContent.trim(), method = methodEnum)
            )
        }
        WidgetSourceType.SQL -> WidgetIn.Sql(
            title = current.widgetTitle.trim(),
            type = WidgetSourceType.SQL.wireValue,
            visualization = current.visualization,
            config = SqlConfig(
                query = current.queryOrUrlOrContent.trim(),
                allowNaturalText = current.allowNaturalText,
                processor = current.selectedProcessor.value,
                naturalTextPrompt = current.naturalTextPrompt.trim().takeIf { it.isNotEmpty() },
                placeholderText = current.placeholderText.trim().takeIf { it.isNotEmpty() }
            )
        )
    }
}

/**
 * Infers the [ProcessorCategory] for a [ModelInfo] instance.
 *
 * @param model Raw [ModelInfo] model.
 * @return Resolved [ProcessorCategory].
 */
private fun inferProcessorCategory(model: ModelInfo): ProcessorCategory {
    if (model.id.equals("SQL", ignoreCase = true) || model.processorType.equals("SQL", ignoreCase = true)) {
        return ProcessorCategory.SQL
    }
    val idLower = model.id.lowercase()
    val isOllama = model.processorType.equals("OLLAMA", ignoreCase = true) ||
        model.provider.equals("ollama", ignoreCase = true) ||
        idLower.startsWith("ollama:") ||
        idLower.startsWith("ollama/") ||
        model.isLocal
    return if (isOllama) ProcessorCategory.OLLAMA else ProcessorCategory.ANY_LLM
}

/**
 * Maps a raw [ModelInfo] response into a strongly typed [ProcessorSelectionOption].
 *
 * @param model Raw [ModelInfo] returned by `/api/v1/ai/models`.
 * @return Mapped [ProcessorSelectionOption].
 */
fun mapModelInfoToProcessorSelection(model: ModelInfo): ProcessorSelectionOption {
    val cat = inferProcessorCategory(model)
    val defaultProvider = if (cat == ProcessorCategory.SQL) "sql" else "ollama"
    return ProcessorSelectionOption(
        id = ProcessorId(if (cat == ProcessorCategory.SQL) "SQL" else model.id),
        displayName = model.name.ifBlank { ProcessorSelectionOption.SQL_DEFAULT.displayName },
        provider = model.provider.ifBlank { defaultProvider },
        category = cat,
        isLocal = cat != ProcessorCategory.ANY_LLM
    )
}

/**
 * Validates title and schema-defined parameter values on a [WizardState.ParameterConfiguration].
 *
 * @param current Active template parameter configuration state.
 * @return Map of field keys to validation error messages.
 */
private fun validateTemplateParameterConfig(
    current: WizardState.ParameterConfiguration
): Map<String, String> {
    val errors = mutableMapOf<String, String>()
    if (current.widgetTitle.isBlank()) {
        errors["title"] = "Title is required"
    }
    current.parameterFields.forEach { field ->
        val rawValue = current.parameterValues.getValue(field.key)
        val fieldError = validateSingleParameterField(field, rawValue)
        if (fieldError != null) {
            errors[field.key] = fieldError
        }
    }
    return errors
}

/**
 * Validates a single template [ParameterField] value against requiredness and numeric type constraints.
 *
 * @param field Parameter schema definition.
 * @param rawValue User-entered string value.
 * @return Error message if invalid, or null if valid.
 */
private fun validateSingleParameterField(field: ParameterField, rawValue: String): String? {
    val cleanValue = rawValue.trim()
    if (cleanValue.isEmpty()) {
        return if (field.isRequired) "${field.title} is required" else null
    }
    return when (field.type.lowercase()) {
        "integer" -> if (cleanValue.toLongOrNull() == null) "${field.title} must be a valid integer" else null
        "number" -> if (cleanValue.toDoubleOrNull() == null) "${field.title} must be a valid number" else null
        else -> null
    }
}

/**
 * Extracts a string primitive property from [obj] or returns [fallback].
 *
 * @param obj Source JSON object.
 * @param key Property key name.
 * @param fallback Default string value if key is missing or not a primitive.
 * @return Extracted string value.
 */
private fun extractJsonString(obj: JsonObject, key: String, fallback: String): String {
    val prim = obj[key] as? JsonPrimitive ?: return fallback
    return prim.content
}

/**
 * Parses a JSON Schema object into a list of [ParameterField] descriptors.
 *
 * @param schema Optional JSON Schema object.
 * @return List of parsed [ParameterField] definitions.
 */
private fun extractSchemaParameterFields(schema: JsonObject?): List<ParameterField> {
    if (schema == null) return emptyList()
    val properties = schema["properties"] as? JsonObject ?: return emptyList()
    val requiredArray = schema["required"] as? JsonArray ?: JsonArray(emptyList())
    val requiredKeys = requiredArray
        .filterIsInstance<JsonPrimitive>()
        .map { it.content }
        .toSet()

    return properties.map { (key, elem) ->
        val obj = elem as? JsonObject ?: JsonObject(emptyMap())
        ParameterField(
            key = key,
            title = extractJsonString(obj, "title", key),
            type = extractJsonString(obj, "type", "string"),
            defaultValue = extractJsonString(obj, "default", ""),
            isRequired = requiredKeys.contains(key)
        )
    }
}

/**
 * Safely substitutes handlebars-style `{{key}}` tokens in [templateSql] with sanitized values from [parameters].
 *
 * @param templateSql SQL template containing `{{key}}` placeholders.
 * @param parameters Map of parameter keys to raw string values.
 * @param fields Parameter field definitions providing type metadata.
 * @return Rendered SQL query string.
 */
private fun substituteSqlParameters(
    templateSql: String,
    parameters: Map<String, String>,
    fields: List<ParameterField>
): String {
    val fieldTypes = fields.associate { it.key to it.type.lowercase() }
    var result = templateSql
    parameters.forEach { (key, rawValue) ->
        val safeValue = when (fieldTypes[key]) {
            "integer" -> (rawValue.trim().toLongOrNull() ?: 0L).toString()
            "number" -> (rawValue.trim().toDoubleOrNull() ?: 0.0).toString()
            else -> rawValue.replace("'", "''")
        }
        val tokenRegex = Regex("""\{\{\s*${Regex.escape(key)}\s*\}\}""")
        result = tokenRegex.replace(result, safeValue)
    }
    return result
}

/**
 * Filters a list of [TemplateResponse] items by optional [category] and search [query].
 *
 * @param templates Full list of available templates.
 * @param category Optional category filter.
 * @param query Free-text search query.
 * @return Filtered list of matching [TemplateResponse] items.
 */
private fun filterWizardTemplates(
    templates: List<TemplateResponse>,
    category: String?,
    query: String
): List<TemplateResponse> {
    return templates.filter { item ->
        val matchesCategory = category == null || item.category.equals(category, ignoreCase = true)
        val matchesQuery = query.isBlank() ||
            item.title.contains(query, ignoreCase = true) ||
            item.description.orEmpty().contains(query, ignoreCase = true)
        matchesCategory && matchesQuery
    }
}
