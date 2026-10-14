/**
 * MPAX Arena ViewModel module orchestrating competitive LLM evaluation against
 * linear programming hospital bed optimization models and user candidate voting.
 */
package io.healthplatform.pulsequery.ui.screens.mpax

import io.healthplatform.pulsequery.api.apis.MpaxArenaApi
import io.healthplatform.pulsequery.api.models.MpaxArenaCandidate
import io.healthplatform.pulsequery.api.models.MpaxArenaRequest
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Available evaluation modes for MPAX Arena.
 */
val MPAX_ARENA_MODES: List<String> = listOf("critic", "translator", "constraints", "sql_vs_mpax")

/**
 * State container for the MPAX Arena UI screen.
 *
 * @property prompt Input prompt for the optimization arena.
 * @property selectedMode Chosen evaluation mode (critic, translator, constraints, sql_vs_mpax).
 * @property isRunning Flag indicating whether an arena run is currently executing.
 * @property isVoting Flag indicating whether a candidate vote is currently in flight.
 * @property experimentId Unique identifier of the persisted arena run.
 * @property errorMessage Error text if evaluation fails.
 * @property candidates Evaluated candidate results from the LLM arena.
 * @property selectedCandidateId Identifier of user-voted winning candidate.
 */
data class MpaxArenaUiState(
    val prompt: String = "Optimize bed capacity during an influx of emergency ICU admissions.",
    val selectedMode: String = "critic",
    val isRunning: Boolean = false,
    val isVoting: Boolean = false,
    val experimentId: String? = null,
    val errorMessage: String? = null,
    val candidates: List<MpaxArenaCandidate> = emptyList(),
    val selectedCandidateId: String? = null
)

/**
 * ViewModel managing state and backend calls for the MPAX Arena screen.
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property mpaxArenaApi Optional explicit [MpaxArenaApi] client for executing MPAX Arena runs and recording candidate votes.
 * @param initialState Initial [MpaxArenaUiState] to seed the ViewModel.
 */
class MpaxArenaViewModel(
    private val scope: CoroutineScope,
    private val mpaxArenaApi: MpaxArenaApi? = null,
    initialState: MpaxArenaUiState = MpaxArenaUiState()
) {
    private val currentMpaxArenaApi: MpaxArenaApi
        get() = mpaxArenaApi ?: AppContainer.mpaxArenaApi

    private val _state = MutableStateFlow(initialState)

    /** Reactive [StateFlow] of the current [MpaxArenaUiState]. */
    val state: StateFlow<MpaxArenaUiState> = _state.asStateFlow()

    /**
     * Updates the scenario prompt text.
     *
     * @param prompt Updated prompt string.
     */
    fun updatePrompt(prompt: String) {
        _state.update { it.copy(prompt = prompt) }
    }

    /**
     * Selects an evaluation mode for the arena competition.
     *
     * @param mode Target evaluation mode identifier.
     */
    fun selectMode(mode: String) {
        _state.update { it.copy(selectedMode = mode) }
    }

    /**
     * Executes the MPAX arena evaluation using the current prompt and mode.
     */
    fun runArena() {
        val current = _state.value
        if (current.prompt.isBlank()) return
        scope.launch {
            _state.update { it.copy(isRunning = true, errorMessage = null) }
            runCatching {
                val req = MpaxArenaRequest(
                    prompt = current.prompt,
                    mode = current.selectedMode
                )
                currentMpaxArenaApi.runMpaxArenaModeApiV1MpaxArenaRunPost(req).body()
            }.fold(
                onSuccess = { response ->
                    _state.update {
                        it.copy(
                            isRunning = false,
                            experimentId = response.experimentId,
                            candidates = response.candidates,
                            selectedCandidateId = response.candidates.firstOrNull { cand -> cand.isSelected == true }?.id
                        )
                    }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isRunning = false,
                            errorMessage = e.message ?: "Failed to execute MPAX Arena evaluation"
                        )
                    }
                }
            )
        }
    }

    /**
     * Casts a persistent winning vote for an LLM candidate.
     *
     * @param candidateId Unique ID of the winning candidate.
     */
    fun voteCandidate(candidateId: String) {
        val expId = _state.value.experimentId ?: return
        scope.launch {
            _state.update { it.copy(isVoting = true) }
            runCatching {
                currentMpaxArenaApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost(
                    runId = expId,
                    candidateId = candidateId
                ).body()
            }.fold(
                onSuccess = { updated ->
                    _state.update {
                        it.copy(
                            isVoting = false,
                            candidates = updated.candidates,
                            selectedCandidateId = candidateId
                        )
                    }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            isVoting = false,
                            errorMessage = e.message ?: "Failed to record candidate vote"
                        )
                    }
                }
            )
        }
    }
}
