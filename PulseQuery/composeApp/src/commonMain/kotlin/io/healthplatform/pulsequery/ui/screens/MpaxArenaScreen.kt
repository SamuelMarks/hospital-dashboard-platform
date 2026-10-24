/**
 * MPAX Arena Screen module for evaluating LLM outputs against mathematical hospital optimization models,
 * delegating state and backend calls to [MpaxArenaViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.MpaxArenaCandidate
import io.healthplatform.pulsequery.ui.screens.mpax.MpaxArenaViewModel
import io.healthplatform.pulsequery.ui.screens.mpax.MPAX_ARENA_MODES as ViewModelMpaxArenaModes
import io.healthplatform.pulsequery.ui.screens.mpax.MpaxArenaUiState as ViewModelMpaxArenaUiState

/**
 * Re-exported [ViewModelMpaxArenaUiState] typealias preserving package compatibility for callers and tests.
 */
typealias MpaxArenaUiState = ViewModelMpaxArenaUiState

/**
 * Re-exported available evaluation modes for MPAX Arena.
 */
val MPAX_ARENA_MODES: List<String> = ViewModelMpaxArenaModes

/**
 * Screen providing comparative evaluation between LLM responses and MPAX linear programming solutions.
 *
 * @param modifier Optional layout modifier.
 * @param initialPrompt Optional pre-filled scenario prompt (e.g., from benchmarks).
 * @param initialState Optional initial [MpaxArenaUiState] for testing and previews.
 * @param viewModel Optional [MpaxArenaViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MpaxArenaScreen(
    modifier: Modifier = Modifier,
    initialPrompt: String? = null,
    initialState: MpaxArenaUiState? = null,
    viewModel: MpaxArenaViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, initialPrompt, initialState, coroutineScope) {
        viewModel ?: MpaxArenaViewModel(
            scope = coroutineScope,
            initialState = initialState ?: MpaxArenaUiState(
                prompt = initialPrompt ?: "Optimize bed capacity during an influx of emergency ICU admissions."
            )
        )
    }

    val uiState by vm.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("MPAX Arena: Model Competition") }
            )
        },
        modifier = modifier.fillMaxSize()
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            OutlinedTextField(
                value = uiState.prompt,
                onValueChange = { vm.updatePrompt(it) },
                label = { Text("Clinical Optimization Scenario Prompt") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "Evaluation Mode",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                MPAX_ARENA_MODES.forEach { mode ->
                    FilterChip(
                        selected = uiState.selectedMode == mode,
                        onClick = { vm.selectMode(mode) },
                        label = { Text(mode.replace('_', ' ').replaceFirstChar { it.uppercase() }) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = { vm.runArena() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isRunning && uiState.prompt.isNotBlank()
            ) {
                if (uiState.isRunning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Evaluating Models...")
                } else {
                    Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Run Arena Competition")
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            uiState.errorMessage?.let { err ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = err,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { vm.runArena() }) {
                            Text("Retry")
                        }
                    }
                }
            }

            if (uiState.candidates.isEmpty() && !uiState.isRunning) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Submit a prompt to benchmark and compare candidate models.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.candidates, key = { it.id }) { candidate ->
                        MpaxCandidateCard(
                            candidate = candidate,
                            isWinner = uiState.selectedCandidateId == candidate.id,
                            isVoting = uiState.isVoting,
                            onVote = {
                                vm.voteCandidate(candidate.id)
                            }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Card displaying an individual LLM competitor's score, proposal, and vote button.
 *
 * @param candidate Competitor data model.
 * @param isWinner True if currently selected by the user.
 * @param isVoting True if a voting API call is actively in flight.
 * @param onVote Callback when user votes for this model.
 * @param modifier Optional layout modifier.
 */
@Composable
fun MpaxCandidateCard(
    candidate: MpaxArenaCandidate,
    isWinner: Boolean,
    isVoting: Boolean = false,
    onVote: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isWinner) {
                MaterialTheme.colorScheme.primaryContainer
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            }
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = candidate.modelName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                candidate.mpaxScore?.let { score ->
                    AssistChip(
                        onClick = {},
                        label = { Text("Score: $score/100") },
                        leadingIcon = {
                            Icon(Icons.Filled.Star, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = candidate.content,
                style = MaterialTheme.typography.bodyMedium
            )

            candidate.sqlSnippet?.let { sql ->
                if (sql.isNotBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                color = MaterialTheme.colorScheme.surface,
                                shape = RoundedCornerShape(8.dp)
                            )
                            .padding(12.dp)
                    ) {
                        Text(
                            text = sql,
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                if (isWinner) {
                    FilledTonalButton(onClick = {}) {
                        Icon(Icons.Filled.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Selected Winner")
                    }
                } else {
                    OutlinedButton(onClick = onVote, enabled = !isVoting) {
                        Text(if (isVoting) "Voting..." else "Vote as Best")
                    }
                }
            }
        }
    }
}
