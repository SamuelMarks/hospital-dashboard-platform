/**
 * Wearable Census ViewModel module orchestrating hospital capacity alert retrieval
 * for compact smartwatch companion displays.
 */
package io.healthplatform.pulsequery.ui.screens.wear

import io.healthplatform.pulsequery.api.apis.AlertRulesApi
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runResultPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable UI state for [WearCensusScreen].
 *
 * @property alerts List of active [AlertRuleResponse] capacity rules for the wearable display.
 * @property occupancyPercent Live hospital occupancy percentage displayed on the wearable tile.
 * @property openBeds Live count of available open beds displayed on the wearable tile.
 * @property isLoading Whether wearable alert data is currently being fetched.
 * @property errorMessage User-visible error message if fetching alert data fails.
 */
data class WearCensusUiState(
    val alerts: List<AlertRuleResponse> = emptyList(),
    val occupancyPercent: Int = 88,
    val openBeds: Int = 42,
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

/**
 * ViewModel managing state and backend calls for the Wearable Census companion screen.
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property alertRulesApi Optional explicit [AlertRulesApi] client for fetching alert rules.
 */
class WearCensusViewModel(
    private val scope: CoroutineScope,
    private val alertRulesApi: AlertRulesApi? = null
) {
    private val currentAlertRulesApi: AlertRulesApi
        get() = alertRulesApi ?: AppContainer.alertRulesApi

    private val _state = MutableStateFlow(WearCensusUiState())

    /** Reactive [StateFlow] of the current [WearCensusUiState]. */
    val state: StateFlow<WearCensusUiState> = _state.asStateFlow()

    /**
     * Loads active hospital capacity alert rules for the wearable display.
     */
    fun loadWearData() {
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runResultPulseAsync {
                currentAlertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet().asResult()
            }.fold(
                onSuccess = { fetchedAlerts ->
                    _state.update {
                        it.copy(
                            alerts = fetchedAlerts,
                            isLoading = false,
                            errorMessage = null
                        )
                    }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = e.messageOrDefault(UiErrorKey.LOAD_WEAR_ALERTS)
                        )
                    }
                }
            )
        }
    }
}
