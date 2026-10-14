/**
 * Analytics ViewModel module orchestrating high-level LLM output analytics retrieval.
 */
package io.healthplatform.pulsequery.ui.screens.analytics

import io.healthplatform.pulsequery.api.apis.AnalyticsApi
import io.healthplatform.pulsequery.api.models.LlmOutputAnalyticsRow
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.AnalyticsScreen].
 *
 * @property records List of [LlmOutputAnalyticsRow] records fetched from the backend.
 * @property isLoading Whether the analytics list is currently loading.
 * @property errorMessage User-visible error message if the request fails.
 */
data class AnalyticsUiState(
    val records: List<LlmOutputAnalyticsRow> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

/**
 * ViewModel managing state and backend calls for the LLM Analytics screen.
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property analyticsApi Optional explicit [AnalyticsApi] client for analytical telemetry endpoints.
 */
class AnalyticsViewModel(
    private val scope: CoroutineScope,
    private val analyticsApi: AnalyticsApi? = null
) {
    private val currentAnalyticsApi: AnalyticsApi
        get() = analyticsApi ?: AppContainer.analyticsApi

    private val _state = MutableStateFlow(AnalyticsUiState())

    /** Reactive [StateFlow] of the current [AnalyticsUiState]. */
    val state: StateFlow<AnalyticsUiState> = _state.asStateFlow()

    /**
     * Fetches the latest LLM output analytics records from the backend.
     *
     * @param fallbackError Default error message if the exception has no message.
     */
    fun loadAnalytics(fallbackError: String = "Unknown error") {
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runCatching {
                currentAnalyticsApi.listLlmOutputsApiV1AnalyticsLlmGet(limit = 100).body()
            }.fold(
                onSuccess = { rows ->
                    _state.update { it.copy(records = rows, isLoading = false, errorMessage = null) }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = e.message ?: fallbackError
                        )
                    }
                }
            )
        }
    }
}
