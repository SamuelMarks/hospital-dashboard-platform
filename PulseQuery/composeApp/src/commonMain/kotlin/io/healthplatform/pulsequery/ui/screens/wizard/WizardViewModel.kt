/**
 * Wizard ViewModel module coordinating template fetching and multi-modal widget authoring.
 */
package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.TemplatesApi
import io.healthplatform.pulsequery.api.models.HttpConfig
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.TemplateResponse
import io.healthplatform.pulsequery.api.models.TextConfig
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetResponse
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
 */
class WizardViewModel(
    val dashboardId: String,
    private val scope: CoroutineScope,
    private val templatesApi: TemplatesApi? = null,
    private val dashboardsApi: DashboardsApi? = null
) {
    private val currentTemplatesApi: TemplatesApi
        get() = templatesApi ?: AppContainer.templatesApi

    private val currentDashboardsApi: DashboardsApi
        get() = dashboardsApi ?: AppContainer.dashboardsApi

    private val _state = MutableStateFlow<WizardState>(WizardState.Loading)

    /** StateFlow exposing current immutable wizard state to observing UI layers. */
    val state: StateFlow<WizardState> = _state.asStateFlow()

    private var allTemplates: List<TemplateResponse> = emptyList()
    private var allCategories: List<String> = emptyList()

    init {
        loadTemplates()
    }

    /**
     * Loads available widget templates from the backend templates API.
     */
    fun loadTemplates() {
        _state.value = WizardState.Loading
        scope.launch {
            runCatchingPulseAsync {
                currentTemplatesApi.listTemplatesApiV1TemplatesGet(limit = 100).body()
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
                    _state.value = WizardState.Error(e.messageOrDefault("Failed to load templates"))
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
            "census", "availability" -> "bar_chart"
            "bottlenecks", "utilization" -> "line_chart"
            else -> "table"
        }

        _state.value = WizardState.ParameterConfiguration(
            template = template,
            widgetTitle = template.title,
            visualization = defaultVis,
            parameterFields = fields,
            parameterValues = initialValues,
            fieldErrors = emptyMap()
        )
    }

    /**
     * Transitions wizard into custom widget configuration mode (SQL, HTTP, or TEXT).
     *
     * @param type Source type identifier ("SQL", "HTTP", or "TEXT").
     */
    fun startCustomWidget(type: String) {
        val defaultViz = if (type.equals("TEXT", ignoreCase = true)) "markdown" else "table"
        _state.value = WizardState.CustomWidgetConfiguration(
            creationType = type.uppercase(),
            widgetTitle = "Custom $type Widget",
            visualization = defaultViz
        )
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
            type = "SQL",
            visualization = current.visualization,
            config = SqlConfig(query = renderedSql)
        )
        persistWidget(widgetIn, onSuccess)
    }

    private fun persistWidget(widgetIn: WidgetIn, onSuccess: (WidgetResponse) -> Unit) {
        _state.value = WizardState.Submitting()
        scope.launch {
            runCatchingPulseAsync {
                currentDashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(
                    dashboardId = dashboardId,
                    widgetIn = widgetIn
                ).body()
            }.fold(
                onSuccess = { created ->
                    _state.value = WizardState.Success(created)
                    onSuccess(created)
                },
                onFailure = { e ->
                    _state.value = WizardState.Error(e.messageOrDefault("Failed to create widget"))
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

private fun validateCustomWidgetConfig(
    current: WizardState.CustomWidgetConfiguration
): Map<String, String> {
    val errors = mutableMapOf<String, String>()
    if (current.widgetTitle.isBlank()) {
        errors["title"] = "Title is required"
    }
    if (current.queryOrUrlOrContent.isBlank()) {
        errors["content"] = "Query/URL/Content cannot be empty"
    }
    return errors
}

private fun buildCustomWidgetPayload(
    current: WizardState.CustomWidgetConfiguration
): WidgetIn {
    return when (current.creationType.uppercase()) {
        "TEXT" -> WidgetIn.Text(
            title = current.widgetTitle.trim(),
            type = "TEXT",
            visualization = current.visualization,
            config = TextConfig(content = current.queryOrUrlOrContent)
        )
        "HTTP" -> {
            val methodEnum = HttpConfig.Method.entries.firstOrNull {
                it.value.equals(current.httpMethod, ignoreCase = true)
            } ?: HttpConfig.Method.GET
            WidgetIn.Http(
                title = current.widgetTitle.trim(),
                type = "HTTP",
                visualization = current.visualization,
                config = HttpConfig(url = current.queryOrUrlOrContent.trim(), method = methodEnum)
            )
        }
        else -> WidgetIn.Sql(
            title = current.widgetTitle.trim(),
            type = "SQL",
            visualization = current.visualization,
            config = SqlConfig(query = current.queryOrUrlOrContent.trim())
        )
    }
}

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

private fun extractJsonString(obj: JsonObject, key: String, fallback: String): String {
    val prim = obj[key] as? JsonPrimitive ?: return fallback
    return prim.content
}

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
