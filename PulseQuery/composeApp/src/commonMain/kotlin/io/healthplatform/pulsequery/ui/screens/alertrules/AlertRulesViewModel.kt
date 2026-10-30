/**
 * Alert Rules ViewModel module orchestrating hospital occupancy threshold alerting rules,
 * including listing, creating, updating, and deleting alert rules.
 */
package io.healthplatform.pulsequery.ui.screens.alertrules

import io.healthplatform.pulsequery.api.apis.AlertRulesApi
import io.healthplatform.pulsequery.api.models.AlertRuleCreate
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertRuleUpdate
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.model.AlertRuleId
import io.healthplatform.pulsequery.core.model.ClinicalRole
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
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.AlertRulesScreen].
 *
 * @property rules List of configured hospital capacity [AlertRuleResponse] items.
 * @property isLoading Whether the alert rules list is currently being fetched.
 * @property errorMessage User-visible error message if loading or deleting fails.
 * @property isSaving Whether a create or update dialog mutation is currently in flight.
 * @property dialogError Validation or API error message inside the active create/edit dialog.
 */
data class AlertRulesUiState(
    val rules: List<AlertRuleResponse> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null,
    val isSaving: Boolean = false,
    val dialogError: String? = null
)

/**
 * ViewModel managing state and backend calls for the Alert Rules screen.
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property alertRulesApi Optional explicit [AlertRulesApi] client for alert rule CRUD endpoints.
 */
class AlertRulesViewModel(
    private val scope: CoroutineScope,
    private val alertRulesApi: AlertRulesApi? = null
) {
    private val currentAlertRulesApi: AlertRulesApi
        get() = alertRulesApi ?: AppContainer.alertRulesApi

    private val _state = MutableStateFlow(AlertRulesUiState())

    /** Reactive [StateFlow] of the current [AlertRulesUiState]. */
    val state: StateFlow<AlertRulesUiState> = _state.asStateFlow()

    /**
     * Loads all configured alert rules from the backend.
     */
    fun loadRules() {
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runResultPulseAsync {
                currentAlertRulesApi.listAlertRulesApiV1AnalyticsAlertRulesGet().asResult()
            }.fold(
                onSuccess = { list ->
                    _state.update { it.copy(rules = list, isLoading = false, errorMessage = null) }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = e.messageOrDefault(UiErrorKey.LOAD_ALERT_RULES)
                        )
                    }
                }
            )
        }
    }

    /**
     * Deletes an alert rule by ID and reloads the rule list on success.
     *
     * @param ruleId Identifier of the rule to delete.
     */
    fun deleteRule(ruleId: String) {
        scope.launch {
            runResultPulseAsync {
                currentAlertRulesApi.deleteAlertRuleApiV1AnalyticsAlertRulesRuleIdDelete(ruleId).asResult()
            }.fold(
                onSuccess = {
                    loadRules()
                },
                onFailure = { e ->
                    _state.update { it.copy(errorMessage = e.messageOrDefault(UiErrorKey.DELETE_ALERT_RULE)) }
                }
            )
        }
    }

    /**
     * Deletes an alert rule by strongly typed [AlertRuleId].
     *
     * @param ruleId Target [AlertRuleId].
     */
    fun deleteRule(ruleId: AlertRuleId) {
        deleteRule(ruleId.value)
    }

    /**
     * Checks whether a user with the specified [ClinicalRole] is permitted to mutate alert rules.
     *
     * @param role User's [ClinicalRole].
     * @return True when [role] is [ClinicalRole.ADMIN] or [ClinicalRole.PHYSICIAN].
     */
    fun canModifyRules(role: ClinicalRole): Boolean =
        role == ClinicalRole.ADMIN || role == ClinicalRole.PHYSICIAN

    /**
     * Clears any active dialog error message.
     */
    fun clearDialogError() {
        _state.update { it.copy(dialogError = null) }
    }

    /**
     * Validates and creates a new capacity alert rule.
     *
     * @param unitCategory Hospital unit category name.
     * @param thresholdText Raw occupancy threshold percentage string.
     * @param severity Alert severity tier.
     * @param onSuccess Callback invoked when creation succeeds.
     */
    fun createRule(
        unitCategory: String,
        thresholdText: String,
        severity: AlertSeverity = AlertSeverity.WARNING,
        onSuccess: () -> Unit = {}
    ) {
        val threshold = thresholdText.toDoubleOrNull()
        if (unitCategory.isBlank()) {
            _state.update { it.copy(dialogError = "Unit category is required") }
            return
        }
        if (threshold == null || threshold < 1.0 || threshold > 100.0) {
            _state.update { it.copy(dialogError = "Threshold must be between 1 and 100") }
            return
        }

        scope.launch {
            _state.update { it.copy(isSaving = true, dialogError = null) }
            runResultPulseAsync {
                currentAlertRulesApi.createAlertRuleApiV1AnalyticsAlertRulesPost(
                    AlertRuleCreate(
                        unitCategory = unitCategory.trim(),
                        thresholdPercentage = threshold,
                        severity = severity,
                        isActive = true
                    )
                ).asResult()
            }.fold(
                onSuccess = {
                    _state.update { it.copy(isSaving = false, dialogError = null) }
                    onSuccess()
                    loadRules()
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isSaving = false,
                            dialogError = e.messageOrDefault(UiErrorKey.CREATE_ALERT_RULE)
                        )
                    }
                }
            )
        }
    }

    /**
     * Validates and updates an existing capacity alert rule.
     *
     * @param ruleId UUID of the alert rule to update.
     * @param unitCategory Updated hospital unit category name.
     * @param thresholdText Raw occupancy threshold percentage string.
     * @param severity Updated alert severity tier.
     * @param isActive Whether the alert rule is active.
     * @param onSuccess Callback invoked when the update succeeds.
     */
    fun updateRule(
        ruleId: String,
        unitCategory: String,
        thresholdText: String,
        severity: AlertSeverity,
        isActive: Boolean,
        onSuccess: () -> Unit = {}
    ) {
        val threshold = thresholdText.toDoubleOrNull()
        if (unitCategory.isBlank()) {
            _state.update { it.copy(dialogError = "Unit category is required") }
            return
        }
        if (threshold == null || threshold < 1.0 || threshold > 100.0) {
            _state.update { it.copy(dialogError = "Threshold must be between 1 and 100") }
            return
        }

        scope.launch {
            _state.update { it.copy(isSaving = true, dialogError = null) }
            runResultPulseAsync {
                currentAlertRulesApi.updateAlertRuleApiV1AnalyticsAlertRulesRuleIdPut(
                    ruleId = ruleId,
                    alertRuleUpdate = AlertRuleUpdate(
                        unitCategory = unitCategory.trim(),
                        thresholdPercentage = threshold,
                        severity = severity,
                        isActive = isActive
                    )
                ).asResult()
            }.fold(
                onSuccess = {
                    _state.update { it.copy(isSaving = false, dialogError = null) }
                    onSuccess()
                    loadRules()
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isSaving = false,
                            dialogError = e.messageOrDefault(UiErrorKey.UPDATE_ALERT_RULE)
                        )
                    }
                }
            )
        }
    }
}
