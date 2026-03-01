package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.ScenarioResult
import io.healthplatform.pulsequery.api.models.ScenarioRunRequest
import io.healthplatform.pulsequery.api.models.SimulationAssignment
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Screen for running complex capacity simulations.
 * Takes a SQL demand definition and maps it to hypothetical capacities.
 *
 * @param onNavigateBack Action to return to the previous screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SimulationScreen(onNavigateBack: () -> Unit) {
    var sqlQuery by remember { mutableStateOf("SELECT service, count FROM incoming_patients") }
    var icuCapacity by remember { mutableStateOf("10") }
    var wardCapacity by remember { mutableStateOf("50") }

    var result by remember { mutableStateOf<ScenarioResult?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val scope = rememberCoroutineScope()

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
                errorMessage = e.message ?: "Simulation failed"
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Capacity Simulation") },
                navigationIcon = {
                    TextButton(onClick = onNavigateBack) {
                        Text("< Back", color = MaterialTheme.colorScheme.onPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
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
                label = { Text("Demand SQL") },
                modifier = Modifier.fillMaxWidth().height(120.dp),
                textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace)
            )

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlinedTextField(
                    value = icuCapacity,
                    onValueChange = { icuCapacity = it },
                    label = { Text("ICU Capacity") },
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = wardCapacity,
                    onValueChange = { wardCapacity = it },
                    label = { Text("WARD Capacity") },
                    modifier = Modifier.weight(1f)
                )
            }

            Button(
                onClick = { runSimulation() },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                } else {
                    Text("Run Simulation")
                }
            }

            if (errorMessage != null) {
                Text(text = "Error: $errorMessage", color = MaterialTheme.colorScheme.error)
            }

            result?.let { res ->
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                Text(
                    text = "Status: ${res.status}",
                    style = MaterialTheme.typography.titleMedium,
                    color = if (res.status == "SUCCESS") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                )
                res.message?.let {
                    Text(text = it, style = MaterialTheme.typography.bodyMedium)
                }

                Spacer(modifier = Modifier.height(8.dp))
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    items(res.assignments) { assignment ->
                        AssignmentCard(assignment)
                    }
                }
            }
        }
    }
}

@Composable
fun AssignmentCard(assignment: SimulationAssignment) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = "Service: ${assignment.service}", style = MaterialTheme.typography.labelMedium)
            Text(
                text = "Target Unit: ${assignment.unit}",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.secondary
            )
            Text(text = "Admitted Patients: ${assignment.patientCount}", style = MaterialTheme.typography.bodySmall)
            if (assignment.delta != null && assignment.delta != 0.0) {
                Text(
                    text = "Delta: ${if (assignment.delta > 0) "+" else ""}${assignment.delta}",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (assignment.delta > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}