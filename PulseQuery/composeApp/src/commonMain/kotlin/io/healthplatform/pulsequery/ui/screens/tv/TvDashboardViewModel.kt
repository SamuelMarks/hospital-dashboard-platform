/**
 * TV Dashboard ViewModel module orchestrating dashboard retrieval for passive 10-foot
 * hospital wallboard displays.
 */
package io.healthplatform.pulsequery.ui.screens.tv

import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable UI state for [TvDashboardScreen].
 *
 * @property activeDashboard Currently loaded [DashboardResponse] displayed on the wallboard.
 * @property isLoading Whether the wallboard dashboard is currently loading.
 * @property errorMessage User-visible error message if loading fails.
 */
data class TvDashboardUiState(
    val activeDashboard: DashboardResponse? = null,
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

/**
 * ViewModel managing state and backend calls for the TV Wallboard screen.
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property dashboardsApi Optional explicit [DashboardsApi] client for fetching dashboards.
 */
class TvDashboardViewModel(
    private val scope: CoroutineScope,
    private val dashboardsApi: DashboardsApi? = null
) {
    private val currentDashboardsApi: DashboardsApi
        get() = dashboardsApi ?: AppContainer.dashboardsApi

    private val _state = MutableStateFlow(TvDashboardUiState())

    /** Reactive [StateFlow] of the current [TvDashboardUiState]. */
    val state: StateFlow<TvDashboardUiState> = _state.asStateFlow()

    /**
     * Loads the primary dashboard for the TV wallboard display.
     */
    fun loadDashboard() {
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runCatching {
                val res = currentDashboardsApi.listDashboardsApiV1DashboardsGet()
                res.body().firstOrNull()
            }.fold(
                onSuccess = { db ->
                    _state.update {
                        it.copy(
                            activeDashboard = db,
                            isLoading = false,
                            errorMessage = null
                        )
                    }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = e.message ?: "Failed to load TV dashboard"
                        )
                    }
                }
            )
        }
    }
}
