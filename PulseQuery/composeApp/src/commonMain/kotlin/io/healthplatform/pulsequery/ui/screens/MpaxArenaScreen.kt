/**
 * MPAX Arena Screen module for evaluating LLM outputs against mathematical hospital optimization models.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.MpaxArenaCandidate
import io.healthplatform.pulsequery.api.models.MpaxArenaRequest
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

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
 * Available evaluation modes for MPAX Arena.
 */
val MPAX_ARENA_MODES: List<String> = listOf("critic", "translator", "constraints", "sql_vs_mpax")

/**
 * Screen providing comparative evaluation between LLM responses and MPAX linear programming solutions.
 *
 * @param modifier Optional layout modifier.
 * @param initialPrompt Optional pre-filled scenario prompt (e.g., from benchmarks).
 * @param initialState Optional initial [MpaxArenaUiState] for testing and previews.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MpaxArenaScreen(
    modifier: Modifier = Modifier,
    initialPrompt: String? = null,
    initialState: MpaxArenaUiState? = null
) {
    var uiState by remember {
        mutableStateOf(
            initialState ?: MpaxArenaUiState(
                prompt = initialPrompt ?: "Optimize bed capacity during an influx of emergency ICU admissions."
            )
        )
    }
    val coroutineScope = rememberCoroutineScope()

    /**
     * Executes the MPAX arena evaluation using the current prompt and mode.
     */
    fun runArena() {
        if (uiState.prompt.isBlank()) return
        coroutineScope.launch {
            uiState = uiState.copy(isRunning = true, errorMessage = null)
            runCatching {
                val req = MpaxArenaRequest(
                    prompt = uiState.prompt,
                    mode = uiState.selectedMode
                )
                AppContainer.mpaxArenaApi.runMpaxArenaModeApiV1MpaxArenaRunPost(req).body()
            }.fold(
                onSuccess = { response ->
                    uiState = uiState.copy(
                        isRunning = false,
                        experimentId = response.experimentId,
                        candidates = response.candidates,
                        selectedCandidateId = response.candidates.firstOrNull { it.isSelected == true }?.id
                    )
                },
                onFailure = { e ->
                    uiState = uiState.copy(
                        isRunning = false,
                        errorMessage = e.message ?: "Failed to execute MPAX Arena evaluation"
                    )
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
        val expId = uiState.experimentId ?: return
        coroutineScope.launch {
            uiState = uiState.copy(isVoting = true)
            runCatching {
                AppContainer.mpaxArenaApi.voteMpaxArenaCandidateApiV1MpaxArenaRunsRunIdCandidatesCandidateIdVotePost(
                    runId = expId,
                    candidateId = candidateId
                ).body()
            }.fold(
                onSuccess = { updated ->
                    uiState = uiState.copy(
                        isVoting = false,
                        candidates = updated.candidates,
                        selectedCandidateId = candidateId
                    )
                },
                onFailure = { e ->
                    uiState = uiState.copy(
                        isVoting = false,
                        errorMessage = e.message ?: "Failed to record candidate vote"
                    )
                }
            )
        }
    }

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
                onValueChange = { uiState = uiState.copy(prompt = it) },
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
                        onClick = { uiState = uiState.copy(selectedMode = mode) },
                        label = { Text(mode.replace('_', ' ').replaceFirstChar { it.uppercase() }) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = { runArena() },
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

            if (uiState.errorMessage != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = uiState.errorMessage ?: "Unknown error",
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { runArena() }) {
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
                                voteCandidate(candidate.id)
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
