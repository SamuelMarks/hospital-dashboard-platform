/**
 * Editor ViewModel module orchestrating ad-hoc SQL query editing, preview execution,
 * and staging queries to the global query cart.
 */
package io.healthplatform.pulsequery.ui.screens.editor

import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.TemplatesApi
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.SQLExecutionRequest
import io.healthplatform.pulsequery.api.models.SQLExecutionResponse
import io.healthplatform.pulsequery.api.models.SqlConfig
import io.healthplatform.pulsequery.api.models.TemplateCreate
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.asResultMap
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runResultPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.QueryCartRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.EditorScreen].
 *
 * @property sqlQuery Current SQL query string in the editor buffer.
 * @property result Latest [SQLExecutionResponse] returned by the preview execution endpoint, or null.
 * @property isLoading Whether a SQL execution request is currently in flight.
 * @property errorMessage User-visible error message if an execution call fails.
 */
data class EditorUiState(
    val sqlQuery: String = "SELECT * FROM patient_admissions LIMIT 10;",
    val result: SQLExecutionResponse? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

/**
 * ViewModel managing state and operations for the SQL Editor screen.
 *
 * @property scope Coroutine scope used for asynchronous API calls.
 * @property aiApi Optional explicit [AiApi] client for executing ad-hoc SQL preview queries.
 * @property queryCartRepository Repository for staging SQL queries to the cart.
 * @property dashboardsApi Optional explicit [DashboardsApi] client for widget persistence.
 * @property templatesApi Optional explicit [TemplatesApi] client for template registration.
 */
class EditorViewModel(
    private val scope: CoroutineScope,
    private val aiApi: AiApi? = null,
    private val queryCartRepository: QueryCartRepository = AppContainer.queryCartRepository,
    private val dashboardsApi: DashboardsApi? = null,
    private val templatesApi: TemplatesApi? = null
) {
    private val currentAiApi: AiApi
        get() = aiApi ?: AppContainer.aiApi

    private val currentDashboardsApi: DashboardsApi
        get() = dashboardsApi ?: AppContainer.dashboardsApi

    private val currentTemplatesApi: TemplatesApi
        get() = templatesApi ?: AppContainer.templatesApi

    private val _state = MutableStateFlow(EditorUiState())

    /** Reactive [StateFlow] of the current [EditorUiState]. */
    val state: StateFlow<EditorUiState> = _state.asStateFlow()

    /**
     * Updates the current SQL query string in the editor.
     *
     * @param sql Updated SQL query string.
     */
    fun updateSqlQuery(sql: String) {
        _state.update { it.copy(sqlQuery = sql) }
    }

    /**
     * Executes the current [EditorUiState.sqlQuery] via [AiApi.executeSqlPreviewApiV1AiExecutePost].
     *
     * @param errorPrefix Prefix prepended to the failure message when an exception occurs.
     */
    fun executeSql(errorPrefix: String = "Execution failed: ") {
        val currentSql = _state.value.sqlQuery
        if (currentSql.isBlank()) return

        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null, result = null) }
            runResultPulseAsync {
                val req = SQLExecutionRequest(sql = currentSql, maxRows = 50)
                currentAiApi.executeSqlPreviewApiV1AiExecutePost(req).asResult()
            }.fold(
                onSuccess = { res ->
                    _state.update { it.copy(result = res, isLoading = false, errorMessage = null) }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            errorMessage = errorPrefix + e.messageOrDefault(UiErrorKey.UNKNOWN_ERROR),
                            isLoading = false
                        )
                    }
                }
            )
        }
    }

    /**
     * Stages the current [EditorUiState.sqlQuery] to the global query cart if non-blank.
     *
     * @param title Descriptive title for the staged query.
     */
    fun stageToCart(title: String = "Editor Query") {
        val currentSql = _state.value.sqlQuery
        if (currentSql.isNotBlank()) {
            queryCartRepository.addQuery(title, currentSql)
        }
    }

    /**
     * Loads the list of available dashboards for saving a custom SQL widget.
     *
     * @return [Result] containing the list of [DashboardResponse] items or a [io.healthplatform.pulsequery.core.error.PulseQueryError].
     */
    suspend fun loadAvailableDashboards(): Result<List<DashboardResponse>> {
        return runResultPulseAsync {
            currentDashboardsApi.listDashboardsApiV1DashboardsGet().asResult()
        }
    }

    /**
     * Persists a SQL query either as a dashboard widget or as a reusable template in the library.
     *
     * @param destination Selected [SaveQueryDestination].
     * @param title Title of the widget or template.
     * @param sql Raw SQL query string.
     * @param dashboardId Target dashboard ID when [destination] is [SaveQueryDestination.DASHBOARD_WIDGET].
     * @param visualization Selected visualization type for dashboard widgets.
     * @param category Template category name when [destination] is [SaveQueryDestination.TEMPLATE].
     * @param description Template description when [destination] is [SaveQueryDestination.TEMPLATE].
     * @return [Result] containing a user-facing confirmation message on success.
     */
    @Suppress("LongParameterList")
    suspend fun saveQuery(
        destination: SaveQueryDestination,
        title: String,
        sql: String,
        dashboardId: String?,
        visualization: String = "table",
        category: String = "Clinical",
        description: String = ""
    ): Result<String> {
        return runResultPulseAsync {
            if (destination == SaveQueryDestination.DASHBOARD_WIDGET && dashboardId != null) {
                val widgetIn = WidgetIn.Sql(
                    title = title.trim(),
                    visualization = visualization,
                    config = SqlConfig(query = sql)
                )
                currentDashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(
                    dashboardId,
                    widgetIn
                ).asResultMap { "Widget successfully added to dashboard" }
            } else {
                val templateCreate = TemplateCreate(
                    title = title.trim(),
                    sqlTemplate = sql,
                    category = category.trim().ifBlank { "Clinical" },
                    description = description.trim()
                )
                currentTemplatesApi.createTemplateApiV1TemplatesPost(templateCreate).asResultMap {
                    "Template successfully registered in library"
                }
            }
        }
    }
}
