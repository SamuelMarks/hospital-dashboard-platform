/**
 * Admin ViewModel module orchestrating platform configuration settings
 * including LLM provider API keys and visible model identifiers.
 */
package io.healthplatform.pulsequery.ui.screens.admin

import io.healthplatform.pulsequery.api.apis.AdminApi
import io.healthplatform.pulsequery.api.models.AdminSettingsUpdateRequest
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.AdminScreen].
 *
 * @property apiKeys Map of configured LLM provider names to their masked or raw API keys.
 * @property visibleModels List of model identifiers visible to clinical users.
 * @property isLoading Whether an administrative load or save request is currently in flight.
 * @property errorMessage User-visible error message if an operation fails.
 */
data class AdminUiState(
    val apiKeys: Map<String, String> = emptyMap(),
    val visibleModels: List<String> = emptyList(),
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

/**
 * ViewModel managing platform configuration state and backend persistence for [io.healthplatform.pulsequery.ui.screens.AdminScreen].
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property adminApi Optional explicit [AdminApi] client for reading and writing platform admin settings.
 */
class AdminViewModel(
    private val scope: CoroutineScope,
    private val adminApi: AdminApi? = null
) {
    private val currentAdminApi: AdminApi
        get() = adminApi ?: AppContainer.adminApi

    private val _state = MutableStateFlow(AdminUiState())

    /** Reactive [StateFlow] of the current [AdminUiState]. */
    val state: StateFlow<AdminUiState> = _state.asStateFlow()

    private val _notifications = MutableSharedFlow<String>(extraBufferCapacity = 8)

    /** Stream of user-facing snackbar notification messages. */
    val notifications: SharedFlow<String> = _notifications.asSharedFlow()

    /**
     * Loads the current administrative settings from the backend.
     *
     * @param errorPrefix Prefix prepended to the error message if loading fails.
     */
    fun loadSettings(errorPrefix: String = "Failed to load admin settings: ") {
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runCatchingPulseAsync {
                currentAdminApi.readAdminSettingsApiV1AdminSettingsGet().asResult().getOrThrow()
            }.fold(
                onSuccess = { settings ->
                    _state.update {
                        it.copy(
                            apiKeys = settings.apiKeys.toMap(),
                            visibleModels = settings.visibleModels.toList(),
                            isLoading = false,
                            errorMessage = null
                        )
                    }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = errorPrefix + e.messageOrDefault(UiErrorKey.UNKNOWN_ERROR)
                        )
                    }
                }
            )
        }
    }

    /**
     * Adds or updates an API key entry for a given [provider].
     *
     * @param provider LLM provider identifier.
     * @param key Secret API key string.
     */
    fun putApiKey(provider: String, key: String) {
        if (provider.isBlank() || key.isBlank()) return
        _state.update { current ->
            val updated = current.apiKeys.toMutableMap()
            updated[provider] = key
            current.copy(apiKeys = updated.toMap())
        }
    }

    /**
     * Removes an API key entry for a given [provider].
     *
     * @param provider LLM provider identifier to remove.
     */
    fun removeApiKey(provider: String) {
        _state.update { current ->
            val updated = current.apiKeys.toMutableMap()
            updated.remove(provider)
            current.copy(apiKeys = updated.toMap())
        }
    }

    /**
     * Adds a model identifier to the visible models list if not already present.
     *
     * @param modelName Model identifier string.
     */
    fun addVisibleModel(modelName: String) {
        if (modelName.isBlank()) return
        _state.update { current ->
            if (current.visibleModels.contains(modelName)) {
                current
            } else {
                current.copy(visibleModels = current.visibleModels + modelName)
            }
        }
    }

    /**
     * Removes a model identifier from the visible models list.
     *
     * @param modelName Model identifier string to remove.
     */
    fun removeVisibleModel(modelName: String) {
        _state.update { current ->
            current.copy(visibleModels = current.visibleModels.filterNot { it == modelName })
        }
    }

    /**
     * Persists the current API keys and visible models to the backend.
     *
     * @param successMessage Message emitted to [notifications] upon successful save.
     * @param errorPrefix Prefix prepended to the error message if saving fails.
     */
    fun saveSettings(
        successMessage: String = "Settings saved successfully",
        errorPrefix: String = "Failed to save admin settings: "
    ) {
        val snapshot = _state.value
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runCatchingPulseAsync {
                val updateReq = AdminSettingsUpdateRequest(
                    apiKeys = snapshot.apiKeys,
                    visibleModels = snapshot.visibleModels
                )
                currentAdminApi.writeAdminSettingsApiV1AdminSettingsPut(updateReq).asResult().getOrThrow()
            }.fold(
                onSuccess = {
                    _state.update { it.copy(isLoading = false, errorMessage = null) }
                    _notifications.tryEmit(successMessage)
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            errorMessage = errorPrefix + e.messageOrDefault(UiErrorKey.UNKNOWN_ERROR)
                        )
                    }
                }
            )
        }
    }
}
