package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.models.ScenarioConstraint
import io.healthplatform.pulsequery.api.models.ScenarioRunRequest
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * Logic and state machine for the Grad-Student Interview Wizard and What-If Branching Engine.
 */
class WizardViewModel(
    private val scope: CoroutineScope
) {
    private val _state = MutableStateFlow<WizardState>(WizardState.Landing)
    val state: StateFlow<WizardState> = _state

    /**
     * Initializes a new scenario workflow from the Landing page.
     */
    fun startScenario(useCase: WizardUseCase) {
        val initialMessage = when (useCase) {
            WizardUseCase.UNIT_ASSIGNMENT -> "I see you want to optimize service-unit assignments. To start, are we looking to modify current unit capacities or restrict certain specialties to specific units?"
            WizardUseCase.SURGICAL_SCHEDULING -> "Let's optimize surgical schedules to smooth bed demand. Are we looking at cardiovascular or general surgeries?"
            WizardUseCase.STAFFING -> "To optimize nurse staffing, should we focus on reducing overtime costs or addressing seasonal volume variations?"
        }

        _state.value = WizardState.ContextGathering(
            useCase = useCase,
            messages = listOf(WizardMessage(isUser = false, text = initialMessage))
        )
    }

    /**
     * Processes a user message and advances the state machine.
     */
    fun submitMessage(text: String) {
        val currentState = _state.value
        when (currentState) {
            is WizardState.ContextGathering -> {
                val updatedMessages = currentState.messages + WizardMessage(isUser = true, text = text)
                
                // Simulate LLM parsing intent into constraints
                val followUpMessage = "Got it. I'm pulling the relevant baseline data. Are there any specific entities (e.g., surgeons, wards) that must be locked in place before I run the optimization?"
                
                _state.value = WizardState.ConstraintIdentification(
                    useCase = currentState.useCase,
                    messages = updatedMessages + WizardMessage(isUser = false, text = followUpMessage),
                    constraints = listOf()
                )
            }
            is WizardState.ConstraintIdentification -> {
                val updatedMessages = currentState.messages + WizardMessage(isUser = true, text = text)
                val newConstraints = currentState.constraints + "User requested constraint: $text"
                
                _state.value = currentState.copy(
                    messages = updatedMessages,
                    constraints = newConstraints
                )
                
                // Trigger execution immediately for demonstration of What-If branching
                executeSimulation(currentState.useCase, newConstraints)
            }
            is WizardState.Execution -> {
                 _state.value = WizardState.Refinement(
                    useCase = currentState.useCase,
                    baseResult = currentState.baseResult,
                    branchResult = currentState.branchResult,
                    messages = listOf(
                        WizardMessage(isUser = false, text = "Here are the side-by-side results. How would you like to refine this? (e.g., 'penalize Friday surgeries')"),
                        WizardMessage(isUser = true, text = text)
                    )
                 )
                 
                 // Re-run execution with refinement
                 executeSimulation(currentState.useCase, listOf("Refined: $text"))
            }
            is WizardState.Refinement -> {
                val updatedMessages = currentState.messages + WizardMessage(isUser = true, text = text)
                
                _state.value = currentState.copy(
                    messages = updatedMessages + WizardMessage(isUser = false, text = "Applying new constraints and recalculating...")
                )
                
                executeSimulation(currentState.useCase, listOf("Further Refined: $text"))
            }
            else -> {}
        }
    }

    private fun executeSimulation(useCase: WizardUseCase, stringConstraints: List<String>) {
        scope.launch {
            try {
                // Construct a base request
                val baseRequest = ScenarioRunRequest(
                    demandSourceSql = "SELECT service, count FROM demand_source",
                    capacityParameters = mapOf("ICU" to 10.0, "WARD" to 50.0)
                )

                // Fetch base result
                val baseResponse = AppContainer.simulationApi.runSimulationApiV1SimulationRunPost(baseRequest)
                val baseResult = baseResponse.body()

                // Construct a branch request using the gathered constraints
                val apiConstraints = stringConstraints.map { 
                    ScenarioConstraint(
                        type = "custom_constraint",
                        service = "ALL",
                        unit = "WARD"
                    )
                }
                
                val branchRequest = ScenarioRunRequest(
                    demandSourceSql = "SELECT service, count FROM demand_source",
                    capacityParameters = mapOf("ICU" to 15.0, "WARD" to 45.0), // tweaked capacities
                    constraints = apiConstraints
                )

                // Fetch branch result
                val branchResponse = AppContainer.simulationApi.runSimulationApiV1SimulationRunPost(branchRequest)
                val branchResult = branchResponse.body()

                val explanation = when (useCase) {
                    WizardUseCase.UNIT_ASSIGNMENT -> "This alternative assignment requires 4 more nurses in WARD to meet the strict specialty constraints, but eliminates off-service placements."
                    WizardUseCase.SURGICAL_SCHEDULING -> "This new schedule reduces cancellations by 15%, but pushes two electives to Friday. Is this acceptable?"
                    WizardUseCase.STAFFING -> "The branch scenario reduces non-voluntary overtime by 20% but increases total scheduled hours by 5%."
                }

                _state.value = WizardState.Execution(
                    useCase = useCase,
                    baseResult = baseResult,
                    branchResult = branchResult,
                    explanation = explanation
                )

            } catch (e: Exception) {
                // In case of error, just fallback to ContextGathering with error message
                _state.value = WizardState.ContextGathering(
                    useCase = useCase,
                    messages = listOf(WizardMessage(isUser = false, text = "Execution failed: ${e.message}"))
                )
            }
        }
    }

    /**
     * Resets the wizard to the landing page.
     */
    fun reset() {
        _state.value = WizardState.Landing
    }
}
