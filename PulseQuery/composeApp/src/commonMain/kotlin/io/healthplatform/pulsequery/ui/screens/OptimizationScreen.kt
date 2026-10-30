/**
 * Hospital Operations Optimization Copilot & Self-Service Workspace Screen (`OptimizationScreen`).
 *
 * Implements the three clinical optimization workflows from `MPAX_PROJECT_PLAN.md` and
 * `[Technical_addendum]_MPAX_PROJECT_PLAN.md` in Compose Multiplatform with full i18n,
 * accessibility semantics (`heading`, `liveRegion`, `contentDescription`, `48.dp` touch targets),
 * and On-Device ML (LiteRT) hot-loading controls.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.core.model.OptimizationUseCaseType
import io.healthplatform.pulsequery.core.model.QuickActionId
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import io.healthplatform.pulsequery.ui.screens.optimization.OptimizationUiState
import io.healthplatform.pulsequery.ui.screens.optimization.OptimizationViewModel
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.database_misconfiguration
import pulsequery.composeapp.generated.resources.optimization_copilot_title
import pulsequery.composeapp.generated.resources.optimization_des_baseline_title
import pulsequery.composeapp.generated.resources.optimization_disclaimer
import pulsequery.composeapp.generated.resources.optimization_litert_active
import pulsequery.composeapp.generated.resources.optimization_litert_hot_load
import pulsequery.composeapp.generated.resources.optimization_prompt_label
import pulsequery.composeapp.generated.resources.optimization_quick_actions
import pulsequery.composeapp.generated.resources.optimization_solve_button
import pulsequery.composeapp.generated.resources.optimization_survey_button
import pulsequery.composeapp.generated.resources.optimization_use_case_service_unit
import pulsequery.composeapp.generated.resources.optimization_use_case_staffing
import pulsequery.composeapp.generated.resources.optimization_use_case_surgical
import pulsequery.composeapp.generated.resources.optimization_what_i_can_do
import pulsequery.composeapp.generated.resources.optimization_what_i_can_do_desc

/**
 * Default Quick Action chips matching the Stanford Children's alpha Bed-Use Tool screenshot.
 */
private val DEFAULT_QUICK_ACTION_CHIPS: List<Pair<String, String>> = listOf(
    "patient_days_by_unit" to "📊 Patient Days by Unit",
    "patient_days_by_service" to "🏥 Patient Days by Service",
    "combined_analysis" to "📈 Combined Analysis",
    "summary_statistics" to "📋 Summary Statistics",
    "optimize_service_units" to "🛏️ Optimize Service-Unit Assignments",
    "smooth_surgical_schedule" to "🩺 Smooth Surgical Schedule (BEDS/POINTS)",
    "optimize_nurse_staffing" to "👩‍⚕️ Optimize Nurse & Physician Staffing"
)

/**
 * Renders the Hospital Operations Optimization Copilot & Self-Service Workspace screen.
 *
 * @param initialPrompt Optional prompt pre-populated from the Benchmarks screen.
 * @param viewModel Optional [OptimizationViewModel] instance override for deterministic testing.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OptimizationScreen(
    initialPrompt: String? = null,
    viewModel: OptimizationViewModel? = null
) {
    val scope = rememberCoroutineScope()
    val vm = remember(viewModel, initialPrompt) {
        viewModel ?: OptimizationViewModel(
            scope = scope,
            initialState = if (!initialPrompt.isNullOrBlank()) {
                OptimizationUiState(prompt = initialPrompt)
            } else {
                OptimizationUiState()
            }
        )
    }

    val state by vm.state.collectAsState()
    val isDatabaseHealthy by AppContainer.networkHealthRepository.isDatabaseHealthy.collectAsState()
    val healthState by AppContainer.networkHealthRepository.healthState.collectAsState()
    val dbMisconfigTitle = stringResource(Res.string.database_misconfiguration)

    LaunchedEffect(vm) {
        if (state.latestSolution == null && !state.isLoading) {
            vm.initializeWorkspace()
        }
    }

    val titleText = stringResource(Res.string.optimization_copilot_title)
    val whatICanDoTitle = stringResource(Res.string.optimization_what_i_can_do)
    val whatICanDoDesc = stringResource(Res.string.optimization_what_i_can_do_desc)
    val quickActionsTitle = stringResource(Res.string.optimization_quick_actions)
    val uc1Label = stringResource(Res.string.optimization_use_case_service_unit)
    val uc2Label = stringResource(Res.string.optimization_use_case_surgical)
    val uc3Label = stringResource(Res.string.optimization_use_case_staffing)
    val promptLabel = stringResource(Res.string.optimization_prompt_label)
    val solveButtonLabel = stringResource(Res.string.optimization_solve_button)
    val hotLoadLabel = stringResource(Res.string.optimization_litert_hot_load)
    val litertActiveLabel = stringResource(Res.string.optimization_litert_active)
    val desBaselineTitle = stringResource(Res.string.optimization_des_baseline_title)
    val surveyButtonLabel = stringResource(Res.string.optimization_survey_button)
    val disclaimerText = stringResource(Res.string.optimization_disclaimer)

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .testTag("optimization-screen"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (!isDatabaseHealthy) {
            item {
                val dbMsg = healthState?.duckdb?.error ?: healthState?.postgres?.error
                    ?: "Database service is experiencing storage or configuration errors."
                DatabaseErrorCard(
                    title = dbMisconfigTitle,
                    message = dbMsg,
                    onRetry = {
                        AppContainer.networkHealthRepository.refreshHealth()
                        vm.initializeWorkspace()
                    }
                )
            }
        }

        item {
            Text(
                text = titleText,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                modifier = Modifier
                    .semantics { heading() }
                    .testTag("optimization-title")
            )
        }

        // Use Case Selector Row
        item {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = state.selectedUseCase == OptimizationUseCaseType.SERVICE_UNIT,
                    onClick = { vm.selectUseCase(OptimizationUseCaseType.SERVICE_UNIT) },
                    label = { Text(uc1Label) },
                    modifier = Modifier
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("chip-uc-service-unit")
                )
                FilterChip(
                    selected = state.selectedUseCase == OptimizationUseCaseType.SURGICAL_SCHEDULING,
                    onClick = { vm.selectUseCase(OptimizationUseCaseType.SURGICAL_SCHEDULING) },
                    label = { Text(uc2Label) },
                    modifier = Modifier
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("chip-uc-surgical")
                )
                FilterChip(
                    selected = state.selectedUseCase == OptimizationUseCaseType.STAFFING_OPTIMIZATION,
                    onClick = { vm.selectUseCase(OptimizationUseCaseType.STAFFING_OPTIMIZATION) },
                    label = { Text(uc3Label) },
                    modifier = Modifier
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("chip-uc-staffing")
                )
            }
        }

        // On-Device ML (LiteRT) Hot-Loading Controls
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedButton(
                    onClick = { vm.hotLoadLiteRtModel("litert-medgemma-4b-int4") },
                    modifier = Modifier
                        .defaultMinSize(minHeight = 48.dp)
                        .testTag("btn-litert-hot-load")
                ) {
                    Text(hotLoadLabel)
                }
                state.activeLiteRtModel?.let { activeOdml ->
                    Text(
                        text = "$litertActiveLabel: ${activeOdml.displayName}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .semantics { liveRegion = LiveRegionMode.Polite }
                            .testTag("badge-litert-active")
                    )
                }
            }
        }

        // Alpha Bed-Use Tool Card: "What I Can Do" & "Quick Actions"
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = whatICanDoTitle,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics { heading() }
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = whatICanDoDesc,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = quickActionsTitle,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.semantics { heading() }
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        DEFAULT_QUICK_ACTION_CHIPS.forEach { (actionId, label) ->
                            AssistChip(
                                onClick = { vm.executeQuickAction(QuickActionId(actionId)) },
                                label = { Text(label) },
                                modifier = Modifier
                                    .defaultMinSize(minHeight = 48.dp)
                                    .semantics { contentDescription = label }
                                    .testTag("qa-$actionId")
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = state.prompt,
                        onValueChange = { vm.updatePrompt(it) },
                        label = { Text(promptLabel) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("input-optimization-prompt")
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Button(
                            onClick = { vm.submitPrompt() },
                            enabled = !state.isLoading && state.prompt.isNotBlank(),
                            modifier = Modifier
                                .defaultMinSize(minHeight = 48.dp)
                                .testTag("btn-submit-optimization")
                        ) {
                            Text(solveButtonLabel)
                        }
                        OutlinedButton(
                            onClick = { vm.submitSurvey() },
                            modifier = Modifier
                                .defaultMinSize(minHeight = 48.dp)
                                .testTag("btn-submit-survey")
                        ) {
                            Text(surveyButtonLabel)
                        }
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = disclaimerText,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        if (state.isLoading) {
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier
                        .semantics { liveRegion = LiveRegionMode.Polite }
                        .testTag("optimization-loading")
                ) {
                    CircularProgressIndicator()
                    Text("Solving JAX/MPAX model...")
                }
            }
        }

        state.errorMessage?.let { errorMsg ->
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { liveRegion = LiveRegionMode.Assertive }
                        .testTag("optimization-error")
                ) {
                    Text(
                        text = errorMsg,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }
        }

        if (state.surveySubmitted) {
            item {
                Text(
                    text = "UX Evaluation Survey Recorded",
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .semantics { liveRegion = LiveRegionMode.Polite }
                        .testTag("survey-submitted-banner")
                )
            }
        }

        state.quickActionReport?.let { report ->
            item {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("quick-action-report-card")
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = report.title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = report.summaryMarkdown,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }

        state.latestSolution?.let { sol ->
            item {
                Text(
                    text = "$desBaselineTitle (Gap: ${sol.desEvaluation.overallExpertGapPct}%)",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier
                        .semantics { heading() }
                        .testTag("des-baseline-header")
                )
            }
            items(sol.desEvaluation.metrics) { metric ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("des-metric-${metric.metricKey}")
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(
                            text = metric.label,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "Manual: ${metric.manualHistoricalValue} | Expert: ${metric.expertBaselineValue} | LLM+MPAX: ${metric.llmMpaxValue} (${metric.improvementVsManualPct}% improvement)",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }
    }
}
