/**
 * Hospital Operations Optimization ViewModel module orchestrating:
 * - Use Case 1: Service-Unit Assignments & Bed-Use Optimization
 * - Use Case 2: Surgical Scheduling (BEDS & POINTS Post-Op Smoothing)
 * - Use Case 3: Cross-Unit Physician & Nurse Scheduling Optimization
 * - Deterministic Quick Actions (`patient_days_by_unit`, `patient_days_by_service`, `combined_analysis`, `summary_statistics`)
 * - On-Device ML (ODML) LiteRT model hot-loading via [LiteRtModelManager]
 * - Qualitative & Quantitative User Experience Survey submission
 */
package io.healthplatform.pulsequery.ui.screens.optimization

import io.healthplatform.pulsequery.api.apis.OptimizationApi
import io.healthplatform.pulsequery.api.models.InstitutionProfileSchema
import io.healthplatform.pulsequery.api.models.ModelCompendiumEntrySchema
import io.healthplatform.pulsequery.api.models.OptimizationIterationRequest
import io.healthplatform.pulsequery.api.models.OptimizationSessionCreate
import io.healthplatform.pulsequery.api.models.OptimizationSessionResponse
import io.healthplatform.pulsequery.api.models.OptimizationSolutionPayload
import io.healthplatform.pulsequery.api.models.OptimizationSolveRequest
import io.healthplatform.pulsequery.api.models.OptimizationSurveyCreate
import io.healthplatform.pulsequery.api.models.QuickActionDefinitionSchema
import io.healthplatform.pulsequery.api.models.QuickActionExecutionRequest
import io.healthplatform.pulsequery.api.models.QuickActionExecutionResponse
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.model.InstitutionId
import io.healthplatform.pulsequery.core.model.OptimizationUseCaseType
import io.healthplatform.pulsequery.core.model.QuickActionId
import io.healthplatform.pulsequery.core.model.SurveyScore
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ml.LiteRtModelDescriptor
import io.healthplatform.pulsequery.ml.LiteRtModelManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/**
 * Immutable UI state for the Hospital Operations Optimization Copilot & Workspace screen.
 *
 * @property selectedUseCase Active clinical optimization use case ([OptimizationUseCaseType]).
 * @property selectedInstitutionId Active partner hospital institution identifier ([InstitutionId]).
 * @property selectedModelId Active LLM or LiteRT on-device model identifier.
 * @property prompt Natural-language instruction entered by the hospital decision maker.
 * @property institutions Available partner hospital institution profiles.
 * @property models Available model compendium entries.
 * @property quickActions Available Quick Action definitions.
 * @property activeSession Active conversational [OptimizationSessionResponse], if started.
 * @property latestSolution Latest solved JAX/MPAX [OptimizationSolutionPayload].
 * @property quickActionReport Latest executed [QuickActionExecutionResponse] table report.
 * @property activeLiteRtModel Currently hot-loaded on-device [LiteRtModelDescriptor], if active.
 * @property isLoading Whether a solver or Quick Action request is in progress.
 * @property errorMessage User-visible error message, or null when healthy.
 * @property surveySubmitted Flag indicating whether the qualitative UX survey was submitted.
 */
@Serializable
data class OptimizationUiState(
    val selectedUseCase: OptimizationUseCaseType = OptimizationUseCaseType.SERVICE_UNIT,
    val selectedInstitutionId: InstitutionId = InstitutionId("stanford_childrens"),
    val selectedModelId: String = "gemini-2.5-pro",
    val prompt: String = "Place all General Pediatrics patients on PCU 350 and assume we open PCU 360 with 10 additional beds.",
    val institutions: List<InstitutionProfileSchema> = emptyList(),
    val models: List<ModelCompendiumEntrySchema> = emptyList(),
    val quickActions: List<QuickActionDefinitionSchema> = emptyList(),
    val activeSession: OptimizationSessionResponse? = null,
    val latestSolution: OptimizationSolutionPayload? = null,
    val quickActionReport: QuickActionExecutionResponse? = null,
    val activeLiteRtModel: LiteRtModelDescriptor? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val surveySubmitted: Boolean = false
)

/**
 * ViewModel managing state, JAX/MPAX optimization solves, Quick Actions, LiteRT hot-loading,
 * and UX survey submissions using `Result`-based error handling.
 *
 * @property scope Coroutine scope used for asynchronous requests.
 * @property optimizationApi Optional explicit [OptimizationApi] client override.
 * @property liteRtManager Optional explicit [LiteRtModelManager] instance override.
 * @param initialState Initial [OptimizationUiState] to seed the ViewModel.
 */
class OptimizationViewModel(
    private val scope: CoroutineScope,
    private val optimizationApi: OptimizationApi? = null,
    private val liteRtManager: LiteRtModelManager? = null,
    initialState: OptimizationUiState = OptimizationUiState()
) {
    private val currentApi: OptimizationApi
        get() = optimizationApi ?: AppContainer.optimizationApi

    private val currentLiteRt: LiteRtModelManager
        get() = liteRtManager ?: AppContainer.liteRtModelManager

    private val _state = MutableStateFlow(initialState)

    /** Reactive [StateFlow] of the current [OptimizationUiState]. */
    val state: StateFlow<OptimizationUiState> = _state.asStateFlow()

    /**
     * Initializes the workspace metadata (institutions, model compendium, Quick Actions)
     * and runs an initial stateless baseline solve.
     */
    fun initializeWorkspace() {
        scope.launch {
            performInitializeWorkspace()
        }
    }

    /**
     * Suspending implementation of workspace initialization returning a [Result].
     *
     * @return [Result] wrapping `Unit` on success or a [PulseQueryError] on failure.
     */
    suspend fun performInitializeWorkspace(): Result<Unit> {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        return runCatchingPulseAsync {
            val insts = currentApi.getOptimizationInstitutionsApiV1OptimizationInstitutionsGet().asResult().getOrThrow()
            val mods = currentApi.getOptimizationModelCompendiumApiV1OptimizationModelsGet().asResult().getOrThrow()
            val qas = currentApi.getOptimizationQuickActionsApiV1OptimizationQuickActionsGet(
                useCase = _state.value.selectedUseCase.wireValue
            ).asResult().getOrThrow()
            val sol = currentApi.solveOptimizationStatelessApiV1OptimizationSolvePost(
                OptimizationSolveRequest(
                    useCase = toRequestUseCase(_state.value.selectedUseCase),
                    institutionId = _state.value.selectedInstitutionId.value,
                    modelId = _state.value.selectedModelId,
                    prompt = null
                )
            ).asResult().getOrThrow()

            _state.update {
                it.copy(
                    institutions = insts,
                    models = mods,
                    quickActions = qas,
                    latestSolution = sol,
                    isLoading = false,
                    errorMessage = null
                )
            }
        }.onFailure { err ->
            _state.update {
                it.copy(
                    isLoading = false,
                    errorMessage = err.messageOrDefault(UiErrorKey.OPTIMIZATION_FAILED)
                )
            }
        }
    }

    /**
     * Updates the natural-language optimization prompt text.
     *
     * @param newPrompt Updated prompt string.
     */
    fun updatePrompt(newPrompt: String) {
        _state.update { it.copy(prompt = newPrompt) }
    }

    /**
     * Switches the active clinical optimization use case and updates the default prompt.
     *
     * @param useCase Selected [OptimizationUseCaseType].
     */
    fun selectUseCase(useCase: OptimizationUseCaseType) {
        val defaultPrompt = when (useCase) {
            OptimizationUseCaseType.SERVICE_UNIT ->
                "Place all General Pediatrics patients on PCU 350 and assume we open PCU 360 with 10 additional beds."
            OptimizationUseCaseType.SURGICAL_SCHEDULING ->
                "Cap daily CVICU post-op admissions for POINTS cardiac procedures at 4 cases."
            OptimizationUseCaseType.STAFFING_OPTIMIZATION ->
                "Cap unexpected RN overtime shifts at 2 per week and expand float pool to 6 shifts."
        }
        _state.update {
            it.copy(
                selectedUseCase = useCase,
                prompt = defaultPrompt,
                activeSession = null,
                quickActionReport = null,
                errorMessage = null
            )
        }
    }

    /**
     * Updates the selected partner hospital institution ID.
     *
     * @param institutionId Target [InstitutionId].
     */
    fun selectInstitution(institutionId: InstitutionId) {
        _state.update {
            it.copy(
                selectedInstitutionId = institutionId,
                activeSession = null,
                quickActionReport = null
            )
        }
    }

    /**
     * Updates the selected LLM or LiteRT model ID.
     *
     * @param modelId Target model identifier string.
     */
    fun selectModel(modelId: String) {
        _state.update { it.copy(selectedModelId = modelId) }
    }

    /**
     * Hot-loads an on-device LiteRT model artifact using [LiteRtModelManager] without throwing exceptions.
     *
     * @param modelId Target LiteRT model identifier (e.g., `"litert-medgemma-4b-int4"`).
     * @return [Result] wrapping the activated [LiteRtModelDescriptor].
     */
    fun hotLoadLiteRtModel(modelId: String): Result<LiteRtModelDescriptor> {
        val res = currentLiteRt.hotLoadModelResult(modelId)
        res.fold(
            onSuccess = { descriptor ->
                _state.update {
                    it.copy(
                        activeLiteRtModel = descriptor,
                        selectedModelId = descriptor.modelId,
                        errorMessage = null
                    )
                }
            },
            onFailure = { err ->
                _state.update {
                    it.copy(errorMessage = err.messageOrDefault(UiErrorKey.LITERT_HOT_LOAD_FAILED))
                }
            }
        )
        return res
    }

    /**
     * Triggers execution of a one-click Quick Action button.
     *
     * @param actionId Strongly typed [QuickActionId].
     */
    fun executeQuickAction(actionId: QuickActionId) {
        scope.launch {
            performExecuteQuickAction(actionId)
        }
    }

    /**
     * Suspending execution of a deterministic Quick Action returning a [Result].
     *
     * @param actionId Strongly typed [QuickActionId].
     * @return [Result] wrapping the [QuickActionExecutionResponse].
     */
    suspend fun performExecuteQuickAction(actionId: QuickActionId): Result<QuickActionExecutionResponse> {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        return runCatchingPulseAsync {
            val reqUseCase = when (_state.value.selectedUseCase) {
                OptimizationUseCaseType.SERVICE_UNIT -> QuickActionExecutionRequest.UseCase.service_unit
                OptimizationUseCaseType.SURGICAL_SCHEDULING -> QuickActionExecutionRequest.UseCase.surgical_scheduling
                OptimizationUseCaseType.STAFFING_OPTIMIZATION -> QuickActionExecutionRequest.UseCase.staffing_optimization
            }
            val resp = currentApi.executeOptimizationQuickActionApiV1OptimizationQuickActionsActionIdPost(
                actionId = actionId.value,
                quickActionExecutionRequest = QuickActionExecutionRequest(
                    institutionId = _state.value.selectedInstitutionId.value,
                    useCase = reqUseCase
                )
            ).asResult().getOrThrow()

            _state.update {
                it.copy(
                    quickActionReport = resp,
                    latestSolution = resp.optimizationSolution ?: it.latestSolution,
                    isLoading = false,
                    errorMessage = null
                )
            }
            resp
        }.onFailure { err ->
            _state.update {
                it.copy(
                    isLoading = false,
                    errorMessage = err.messageOrDefault(UiErrorKey.QUICK_ACTION_FAILED)
                )
            }
        }
    }

    /**
     * Submits the current conversational prompt to create or iterate an optimization session.
     */
    fun submitPrompt() {
        scope.launch {
            performSubmitPrompt()
        }
    }

    /**
     * Suspending execution of a conversational optimization turn returning a [Result].
     *
     * @return [Result] wrapping the updated [OptimizationSolutionPayload].
     */
    suspend fun performSubmitPrompt(): Result<OptimizationSolutionPayload> {
        val current = _state.value
        val cleanedPrompt = current.prompt.trim()
        if (cleanedPrompt.isEmpty()) {
            val err = PulseQueryError.Http.BadRequest("Prompt cannot be empty")
            _state.update { it.copy(errorMessage = err.message) }
            return Result.failure(err)
        }

        _state.update { it.copy(isLoading = true, errorMessage = null) }
        return runCatchingPulseAsync {
            val existingSession = current.activeSession
            if (existingSession == null) {
                val createUseCase = when (current.selectedUseCase) {
                    OptimizationUseCaseType.SERVICE_UNIT -> OptimizationSessionCreate.UseCase.service_unit
                    OptimizationUseCaseType.SURGICAL_SCHEDULING -> OptimizationSessionCreate.UseCase.surgical_scheduling
                    OptimizationUseCaseType.STAFFING_OPTIMIZATION -> OptimizationSessionCreate.UseCase.staffing_optimization
                }
                val created = currentApi.createOptimizationSessionApiV1OptimizationSessionsPost(
                    OptimizationSessionCreate(
                        useCase = createUseCase,
                        institutionId = current.selectedInstitutionId.value,
                        initialPrompt = cleanedPrompt,
                        modelId = current.selectedModelId
                    )
                ).asResult().getOrThrow()

                val sol = created.latestSolution
                    ?: currentApi.solveOptimizationStatelessApiV1OptimizationSolvePost(
                        OptimizationSolveRequest(
                            useCase = toRequestUseCase(current.selectedUseCase),
                            institutionId = current.selectedInstitutionId.value,
                            prompt = cleanedPrompt,
                            modelId = current.selectedModelId
                        )
                    ).asResult().getOrThrow()

                _state.update {
                    it.copy(
                        activeSession = created,
                        latestSolution = sol,
                        isLoading = false,
                        errorMessage = null
                    )
                }
                sol
            } else {
                val turn = currentApi.iterateOptimizationSessionApiV1OptimizationSessionsSessionIdIteratePost(
                    sessionId = existingSession.id,
                    optimizationIterationRequest = OptimizationIterationRequest(
                        prompt = cleanedPrompt,
                        modelId = current.selectedModelId
                    )
                ).asResult().getOrThrow()

                val updatedIterations = (existingSession.iterations ?: emptyList()) + turn
                _state.update {
                    it.copy(
                        activeSession = existingSession.copy(
                            latestSolution = turn.solution,
                            iterations = updatedIterations
                        ),
                        latestSolution = turn.solution,
                        isLoading = false,
                        errorMessage = null
                    )
                }
                turn.solution
            }
        }.onFailure { err ->
            _state.update {
                it.copy(
                    isLoading = false,
                    errorMessage = err.messageOrDefault(UiErrorKey.OPTIMIZATION_FAILED)
                )
            }
        }
    }

    /**
     * Submits the qualitative & quantitative UX evaluation survey (Metric 2 of Technical Addendum).
     */
    fun submitSurvey() {
        scope.launch {
            performSubmitSurvey(SurveyScore(5), SurveyScore(5), SurveyScore(5), "")
        }
    }

    /**
     * Suspending submission of the UX evaluation survey returning a [Result].
     *
     * @param scoreManual Rating (1-5) vs. manual graduate-student email process.
     * @param scoreTech Rating (1-5) vs. other hospital workflow technology.
     * @param scoreInterp Rating (1-5) of clinical interpretability.
     * @param feedback Qualitative comments.
     * @return [Result] wrapping `Unit` on success.
     */
    suspend fun performSubmitSurvey(
        scoreManual: SurveyScore,
        scoreTech: SurveyScore,
        scoreInterp: SurveyScore,
        feedback: String
    ): Result<Unit> {
        val current = _state.value
        val surveyUseCase = when (current.selectedUseCase) {
            OptimizationUseCaseType.SERVICE_UNIT -> OptimizationSurveyCreate.UseCase.service_unit
            OptimizationUseCaseType.SURGICAL_SCHEDULING -> OptimizationSurveyCreate.UseCase.surgical_scheduling
            OptimizationUseCaseType.STAFFING_OPTIMIZATION -> OptimizationSurveyCreate.UseCase.staffing_optimization
        }
        return runCatchingPulseAsync {
            currentApi.submitOptimizationSurveyApiV1OptimizationSurveysPost(
                OptimizationSurveyCreate(
                    scoreVsManualProcess = scoreManual.value,
                    scoreVsOtherWorkflowTech = scoreTech.value,
                    interpretabilityScore = scoreInterp.value,
                    sessionId = current.activeSession?.id,
                    useCase = surveyUseCase,
                    roleCategory = "Physician",
                    qualitativeFeedback = feedback
                )
            ).asResult().getOrThrow()
            _state.update { it.copy(surveySubmitted = true, errorMessage = null) }
        }.onFailure { err ->
            _state.update {
                it.copy(errorMessage = err.messageOrDefault(UiErrorKey.SURVEY_SUBMISSION_FAILED))
            }
        }
    }

    private fun toRequestUseCase(uc: OptimizationUseCaseType): OptimizationSolveRequest.UseCase =
        when (uc) {
            OptimizationUseCaseType.SERVICE_UNIT -> OptimizationSolveRequest.UseCase.service_unit
            OptimizationUseCaseType.SURGICAL_SCHEDULING -> OptimizationSolveRequest.UseCase.surgical_scheduling
            OptimizationUseCaseType.STAFFING_OPTIMIZATION -> OptimizationSolveRequest.UseCase.staffing_optimization
        }
}
