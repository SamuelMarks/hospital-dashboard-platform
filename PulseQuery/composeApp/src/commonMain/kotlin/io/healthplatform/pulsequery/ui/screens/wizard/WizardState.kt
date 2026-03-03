package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.models.ScenarioResult

/**
 * Defines the structured use cases available in the optimization wizard.
 */
enum class WizardUseCase(val title: String, val description: String) {
    UNIT_ASSIGNMENT("Service-Unit Assignments", "Optimize patient placements on hospital units based on medical team specialty."),
    SURGICAL_SCHEDULING("Surgical Scheduling", "Smooth post-operative bed demand to reduce cancellations."),
    STAFFING("Nurse Scheduling", "Optimize shift placements considering cost and burnout.")
}

/**
 * A message representation in the wizard chat flow.
 *
 * @property isUser True if the message is from the user, false if from the LLM assistant.
 * @property text The content of the message.
 */
data class WizardMessage(
    val isUser: Boolean,
    val text: String
)

/**
 * Represents the current step in the guided scenario workflow.
 */
sealed class WizardState {
    /**
     * Initial screen showing the available use cases.
     */
    data object Landing : WizardState()

    /**
     * Chat phase: Gathering context from the user.
     * @property useCase The selected use case.
     * @property messages Chat history.
     */
    data class ContextGathering(
        val useCase: WizardUseCase,
        val messages: List<WizardMessage>
    ) : WizardState()

    /**
     * Translating intent into constraints before execution.
     * @property useCase The selected use case.
     * @property messages Chat history.
     * @property constraints Detected operational constraints.
     */
    data class ConstraintIdentification(
        val useCase: WizardUseCase,
        val messages: List<WizardMessage>,
        val constraints: List<String>
    ) : WizardState()

    /**
     * Executing the model and displaying side-by-side results.
     * @property useCase The selected use case.
     * @property baseResult The baseline simulation result.
     * @property branchResult The alternative scenario result.
     * @property explanation LLM generated explanation of tradeoffs.
     */
    data class Execution(
        val useCase: WizardUseCase,
        val baseResult: ScenarioResult,
        val branchResult: ScenarioResult?,
        val explanation: String
    ) : WizardState()

    /**
     * User can provide feedback on the results to refine constraints.
     * @property useCase The selected use case.
     * @property baseResult The baseline simulation result.
     * @property branchResult The newly generated alternative scenario result.
     * @property messages Chat history for the refinement process.
     */
    data class Refinement(
        val useCase: WizardUseCase,
        val baseResult: ScenarioResult,
        val branchResult: ScenarioResult?,
        val messages: List<WizardMessage>
    ) : WizardState()
}
