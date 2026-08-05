/**
 * Component for rendering the SimulationScreen.
 * Provides the main user interface for this screen.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.ScenarioResult
import io.healthplatform.pulsequery.api.models.ScenarioRunRequest
import io.healthplatform.pulsequery.api.models.SimulationAssignment
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Screen for running complex capacity simulations.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SimulationScreen() {
    var sqlQuery by remember { mutableStateOf("SELECT service, count FROM incoming_patients") }
    var icuCapacity by remember { mutableStateOf("10") }
    var wardCapacity by remember { mutableStateOf("50") }

    var result by remember { mutableStateOf<ScenarioResult?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val scope = rememberCoroutineScope()
    
    val errSimFailed = stringResource(Res.string.simulation_failed)

    fun runSimulation() {
        scope.launch {
            isLoading = true
            errorMessage = null
            result = null
            try {
                val req = ScenarioRunRequest(
                    demandSourceSql = sqlQuery,
                    capacityParameters = mapOf(
                        "ICU" to (icuCapacity.toDoubleOrNull() ?: 10.0),
                        "WARD" to (wardCapacity.toDoubleOrNull() ?: 50.0)
                    )
                )
                val response = AppContainer.simulationApi.runSimulationApiV1SimulationRunPost(req)
                result = response.body()
            } catch (e: Exception) {
                errorMessage = e.message ?: errSimFailed
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.capacity_simulation)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface,
                )
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { runSimulation() },
                icon = { if (isLoading) CircularProgressIndicator(modifier = Modifier.size(24.dp)) else Icon(Icons.Filled.PlayArrow, contentDescription = null) },
                text = { Text(stringResource(Res.string.run_simulation)) },
                expanded = !isLoading
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = sqlQuery,
                onValueChange = { sqlQuery = it },
                label = { Text(stringResource(Res.string.demand_sql)) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 150.dp),
                textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace),
                shape = MaterialTheme.shapes.medium
            )

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = icuCapacity,
                    onValueChange = { icuCapacity = it },
                    label = { Text(stringResource(Res.string.icu_capacity)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = wardCapacity,
                    onValueChange = { wardCapacity = it },
                    label = { Text(stringResource(Res.string.ward_capacity)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f)
                )
            }

            if (errorMessage != null) {
                ElevatedCard(
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val errTxt = stringResource(Res.string.error, errorMessage!!)
                    Text(
                        text = errTxt,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }

            result?.let { res ->
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                ElevatedCard(
                    colors = CardDefaults.elevatedCardColors(
                        containerColor = if (res.status == "SUCCESS") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer
                    ),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = stringResource(Res.string.status_msg, res.status),
                            style = MaterialTheme.typography.titleMedium,
                            color = if (res.status == "SUCCESS") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onErrorContainer
                        )
                        res.message?.let {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = it,
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (res.status == "SUCCESS") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onErrorContainer
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(bottom = 80.dp) // space for FAB
                ) {
                    items(res.assignments) { assignment ->
                        AssignmentElevatedCard(assignment)
                    }
                }
            }
        }
    }
}

@Composable
fun AssignmentElevatedCard(assignment: SimulationAssignment) {
    ElevatedCard(modifier = Modifier.fillMaxWidth(), elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = stringResource(Res.string.service_msg, assignment.service), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(Res.string.target_unit_msg, assignment.unit),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(text = stringResource(Res.string.admitted_patients_msg, assignment.patientCount.toString()), style = MaterialTheme.typography.bodyMedium)
                if (assignment.delta != null && assignment.delta != 0.0) {
                    Surface(
                        color = if (assignment.delta > 0) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = stringResource(Res.string.delta_msg, if (assignment.delta > 0) "+" else "", assignment.delta.toString()),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (assignment.delta > 0) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }
}
