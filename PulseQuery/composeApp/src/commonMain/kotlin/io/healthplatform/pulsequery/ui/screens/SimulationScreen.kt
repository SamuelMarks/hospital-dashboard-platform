/**
 * Component for rendering the SimulationScreen.
 * Provides the main user interface for capacity simulation with advanced constraint editing,
 * delegating all state and API calls to [SimulationViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.ScenarioConstraint
import io.healthplatform.pulsequery.api.models.SimulationAssignment
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import io.healthplatform.pulsequery.ui.screens.simulation.SimulationViewModel
import kotlinx.coroutines.CoroutineScope
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.add_affinity_override
import pulsequery.composeapp.generated.resources.add_constraint
import pulsequery.composeapp.generated.resources.admitted_patients_msg
import pulsequery.composeapp.generated.resources.affinity_overrides
import pulsequery.composeapp.generated.resources.affinity_score
import pulsequery.composeapp.generated.resources.before_after_comparison
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.capacity_simulation
import pulsequery.composeapp.generated.resources.clinical_service
import pulsequery.composeapp.generated.resources.constraint_type
import pulsequery.composeapp.generated.resources.custom_constraints
import pulsequery.composeapp.generated.resources.delta_change
import pulsequery.composeapp.generated.resources.delta_msg
import pulsequery.composeapp.generated.resources.demand_sql
import pulsequery.composeapp.generated.resources.error
import pulsequery.composeapp.generated.resources.icu_capacity
import pulsequery.composeapp.generated.resources.max_beds
import pulsequery.composeapp.generated.resources.min_beds
import pulsequery.composeapp.generated.resources.no_affinities_added
import pulsequery.composeapp.generated.resources.no_constraints_added
import pulsequery.composeapp.generated.resources.original_occupancy
import pulsequery.composeapp.generated.resources.proposed_occupancy
import pulsequery.composeapp.generated.resources.run_simulation
import pulsequery.composeapp.generated.resources.service_msg
import pulsequery.composeapp.generated.resources.simulation_failed
import pulsequery.composeapp.generated.resources.status_msg
import pulsequery.composeapp.generated.resources.target_unit_msg
import pulsequery.composeapp.generated.resources.ward_capacity
import pulsequery.composeapp.generated.resources.ward_unit

/**
 * Screen for running complex capacity simulations with custom constraints and affinity overrides.
 *
 * @param customScope Optional custom coroutine scope for tests or lifecycle override.
 * @param viewModel Optional [SimulationViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SimulationScreen(
    customScope: CoroutineScope? = null,
    viewModel: SimulationViewModel? = null
) {
    val scope = customScope ?: rememberCoroutineScope()
    val vm = remember(viewModel, scope) {
        viewModel ?: SimulationViewModel(scope = scope)
    }

    val uiState by vm.state.collectAsState()

    var showAddConstraintDialog by remember { mutableStateOf(false) }
    var showAddAffinityDialog by remember { mutableStateOf(false) }

    val isDatabaseHealthy by AppContainer.networkHealthRepository.isDatabaseHealthy.collectAsState()
    val healthState by AppContainer.networkHealthRepository.healthState.collectAsState()

    val errSimFailed = stringResource(Res.string.simulation_failed)

    LaunchedEffect(vm) {
        vm.loadSchemaTables()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.capacity_simulation)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { vm.runSimulation(fallbackError = errSimFailed) },
                modifier = Modifier.semantics { contentDescription = "Run Simulation" },
                icon = {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    } else {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    }
                },
                text = { Text(stringResource(Res.string.run_simulation)) },
                expanded = !uiState.isLoading
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(bottom = 80.dp)
        ) {
            if (!isDatabaseHealthy) {
                item {
                    val dbMsg = healthState?.duckdb?.error ?: healthState?.postgres?.error
                        ?: "Database service is unreachable or uninitialized. Verify database configuration."
                    DatabaseErrorCard(
                        title = "Database Misconfiguration",
                        message = dbMsg,
                        onRetry = {
                            AppContainer.networkHealthRepository.refreshHealth()
                        }
                    )
                }
            }

            item {
                OutlinedTextField(
                    value = uiState.sqlQuery,
                    onValueChange = { vm.updateSqlQuery(it) },
                    label = { Text(stringResource(Res.string.demand_sql)) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
                    textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace),
                    shape = MaterialTheme.shapes.medium
                )
            }

            item {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = uiState.icuCapacity,
                        onValueChange = { vm.updateIcuCapacity(it) },
                        label = { Text(stringResource(Res.string.icu_capacity)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = uiState.wardCapacity,
                        onValueChange = { vm.updateWardCapacity(it) },
                        label = { Text(stringResource(Res.string.ward_capacity)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            // Custom Constraints Section
            item {
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(Res.string.custom_constraints),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            Button(
                                onClick = { showAddConstraintDialog = true },
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(stringResource(Res.string.add_constraint))
                            }
                        }

                        if (uiState.constraints.isEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = stringResource(Res.string.no_constraints_added),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            Spacer(modifier = Modifier.height(8.dp))
                            uiState.constraints.forEachIndexed { index, c ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "${c.service} ➔ ${c.unit} (${c.type}: min=${c.min ?: "-"}, max=${c.max ?: "-"})",
                                        style = MaterialTheme.typography.bodyMedium,
                                        modifier = Modifier.weight(1f)
                                    )
                                    IconButton(
                                        onClick = {
                                            vm.removeConstraintAt(index)
                                        }
                                    ) {
                                        Icon(Icons.Default.Close, contentDescription = "Delete constraint", modifier = Modifier.size(16.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Affinity Overrides Section
            item {
                ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(Res.string.affinity_overrides),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            Button(
                                onClick = { showAddAffinityDialog = true },
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(stringResource(Res.string.add_affinity_override))
                            }
                        }

                        if (uiState.affinityOverrides.isEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = stringResource(Res.string.no_affinities_added),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            Spacer(modifier = Modifier.height(8.dp))
                            uiState.affinityOverrides.forEach { (srv, unitMap) ->
                                unitMap.forEach { (unit, score) ->
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(vertical = 4.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(
                                            text = "$srv ➔ $unit: Affinity score $score",
                                            style = MaterialTheme.typography.bodyMedium,
                                            modifier = Modifier.weight(1f)
                                        )
                                        IconButton(
                                            onClick = {
                                                vm.removeAffinityOverride(srv, unit)
                                            }
                                        ) {
                                            Icon(Icons.Default.Close, contentDescription = "Delete affinity", modifier = Modifier.size(16.dp))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            uiState.errorMessage?.let { err ->
                item {
                    ElevatedCard(
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        val errTxt = stringResource(Res.string.error, err)
                        Text(
                            text = errTxt,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                }
            }

            uiState.result?.let { res ->
                item {
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
                }

                item {
                    BedOccupancyComparisonTable(assignments = res.assignments)
                }

                items(res.assignments) { assignment ->
                    AssignmentElevatedCard(assignment)
                }
            }
        }

        // Add Constraint Dialog
        if (showAddConstraintDialog) {
            AddConstraintDialog(
                availableServices = uiState.availableServices,
                availableUnits = uiState.availableUnits,
                onDismiss = { showAddConstraintDialog = false },
                onAdd = { newConstraint ->
                    vm.addConstraint(newConstraint)
                    showAddConstraintDialog = false
                }
            )
        }

        // Add Affinity Dialog
        if (showAddAffinityDialog) {
            AddAffinityDialog(
                availableServices = uiState.availableServices,
                availableUnits = uiState.availableUnits,
                onDismiss = { showAddAffinityDialog = false },
                onAdd = { srv, unt, score ->
                    vm.putAffinityOverride(srv, unt, score)
                    showAddAffinityDialog = false
                }
            )
        }
    }
}

/**
 * Dialog prompting user to configure a new hard constraint.
 *
 * @param availableServices Dropdown options for clinical services.
 * @param availableUnits Dropdown options for hospital wards.
 * @param onDismiss Invoked to cancel dialog.
 * @param onAdd Invoked with constructed [ScenarioConstraint].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddConstraintDialog(
    availableServices: List<String>,
    availableUnits: List<String>,
    onDismiss: () -> Unit,
    onAdd: (ScenarioConstraint) -> Unit
) {
    var selectedService by remember { mutableStateOf(availableServices.firstOrNull() ?: "ICU") }
    var selectedUnit by remember { mutableStateOf(availableUnits.firstOrNull() ?: "ICU") }
    var constraintType by remember { mutableStateOf("force_flow") }
    var minBeds by remember { mutableStateOf("") }
    var maxBeds by remember { mutableStateOf("") }

    var serviceExpanded by remember { mutableStateOf(false) }
    var unitExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(Res.string.add_constraint)) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                // Service Dropdown
                ExposedDropdownMenuBox(
                    expanded = serviceExpanded,
                    onExpandedChange = { serviceExpanded = !serviceExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedService,
                        onValueChange = { selectedService = it },
                        label = { Text(stringResource(Res.string.clinical_service)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = serviceExpanded) },
                        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable).fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = serviceExpanded,
                        onDismissRequest = { serviceExpanded = false }
                    ) {
                        availableServices.forEach { service ->
                            DropdownMenuItem(
                                text = { Text(service) },
                                onClick = {
                                    selectedService = service
                                    serviceExpanded = false
                                }
                            )
                        }
                    }
                }

                // Unit Dropdown
                ExposedDropdownMenuBox(
                    expanded = unitExpanded,
                    onExpandedChange = { unitExpanded = !unitExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedUnit,
                        onValueChange = { selectedUnit = it },
                        label = { Text(stringResource(Res.string.ward_unit)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = unitExpanded) },
                        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable).fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = unitExpanded,
                        onDismissRequest = { unitExpanded = false }
                    ) {
                        availableUnits.forEach { unit ->
                            DropdownMenuItem(
                                text = { Text(unit) },
                                onClick = {
                                    selectedUnit = unit
                                    unitExpanded = false
                                }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = constraintType,
                    onValueChange = { constraintType = it },
                    label = { Text(stringResource(Res.string.constraint_type)) },
                    modifier = Modifier.fillMaxWidth()
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = minBeds,
                        onValueChange = { minBeds = it },
                        label = { Text(stringResource(Res.string.min_beds)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = maxBeds,
                        onValueChange = { maxBeds = it },
                        label = { Text(stringResource(Res.string.max_beds)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onAdd(
                        ScenarioConstraint(
                            type = constraintType,
                            service = selectedService,
                            unit = selectedUnit,
                            min = minBeds.toDoubleOrNull(),
                            max = maxBeds.toDoubleOrNull()
                        )
                    )
                },
                modifier = Modifier.semantics { contentDescription = "Confirm Add Constraint" }
            ) {
                Text(stringResource(Res.string.add_constraint))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(Res.string.cancel))
            }
        }
    )
}

/**
 * Dialog prompting user to configure an affinity override score.
 *
 * @param availableServices Dropdown options for clinical services.
 * @param availableUnits Dropdown options for hospital wards.
 * @param onDismiss Invoked to cancel dialog.
 * @param onAdd Invoked with (Service, Unit, Score).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddAffinityDialog(
    availableServices: List<String>,
    availableUnits: List<String>,
    onDismiss: () -> Unit,
    onAdd: (String, String, Double) -> Unit
) {
    var selectedService by remember { mutableStateOf(availableServices.firstOrNull() ?: "ICU") }
    var selectedUnit by remember { mutableStateOf(availableUnits.firstOrNull() ?: "ICU") }
    var affinityScore by remember { mutableStateOf("1.0") }

    var serviceExpanded by remember { mutableStateOf(false) }
    var unitExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(Res.string.add_affinity_override)) },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                ExposedDropdownMenuBox(
                    expanded = serviceExpanded,
                    onExpandedChange = { serviceExpanded = !serviceExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedService,
                        onValueChange = { selectedService = it },
                        label = { Text(stringResource(Res.string.clinical_service)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = serviceExpanded) },
                        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable).fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = serviceExpanded,
                        onDismissRequest = { serviceExpanded = false }
                    ) {
                        availableServices.forEach { service ->
                            DropdownMenuItem(
                                text = { Text(service) },
                                onClick = {
                                    selectedService = service
                                    serviceExpanded = false
                                }
                            )
                        }
                    }
                }

                ExposedDropdownMenuBox(
                    expanded = unitExpanded,
                    onExpandedChange = { unitExpanded = !unitExpanded }
                ) {
                    OutlinedTextField(
                        value = selectedUnit,
                        onValueChange = { selectedUnit = it },
                        label = { Text(stringResource(Res.string.ward_unit)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = unitExpanded) },
                        modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryEditable).fillMaxWidth()
                    )
                    ExposedDropdownMenu(
                        expanded = unitExpanded,
                        onDismissRequest = { unitExpanded = false }
                    ) {
                        availableUnits.forEach { unit ->
                            DropdownMenuItem(
                                text = { Text(unit) },
                                onClick = {
                                    selectedUnit = unit
                                    unitExpanded = false
                                }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = affinityScore,
                    onValueChange = { affinityScore = it },
                    label = { Text(stringResource(Res.string.affinity_score)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val score = affinityScore.toDoubleOrNull() ?: 1.0
                    onAdd(selectedService, selectedUnit, score)
                },
                modifier = Modifier.semantics { contentDescription = "Confirm Add Affinity" }
            ) {
                Text(stringResource(Res.string.add_affinity_override))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(Res.string.cancel))
            }
        }
    )
}

/**
 * Tabular component presenting before-and-after bed occupancy comparison with color-coded deltas.
 *
 * @param assignments List of simulation assignment outcomes.
 * @param modifier Compose modifier applied to card.
 */
@Composable
fun BedOccupancyComparisonTable(
    assignments: List<SimulationAssignment>,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth(),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 3.dp)
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .semantics { contentDescription = "Bed occupancy comparison table" }
        ) {
            Text(
                text = stringResource(Res.string.before_after_comparison),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { heading() }
            )
            Spacer(modifier = Modifier.height(12.dp))

            // Header
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = stringResource(Res.string.clinical_service),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(2f)
                )
                Text(
                    text = stringResource(Res.string.ward_unit),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1.5f)
                )
                Text(
                    text = stringResource(Res.string.original_occupancy),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = stringResource(Res.string.proposed_occupancy),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f)
                )
                Text(
                    text = stringResource(Res.string.delta_change),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1.2f)
                )
            }
            HorizontalDivider()

            assignments.forEach { row ->
                val original = row.originalCount ?: 0.0
                val proposed = row.patientCount
                val delta = row.delta ?: (proposed - original)

                val deltaText = when {
                    delta > 0.0 -> "+${if (delta % 1.0 == 0.0) delta.toInt() else delta}"
                    delta < 0.0 -> "${if (delta % 1.0 == 0.0) delta.toInt() else delta}"
                    else -> "0"
                }

                val deltaColor = when {
                    delta > 0.0 -> Color(0xFF10B981) // Green
                    delta < 0.0 -> Color(0xFFEF4444) // Red
                    else -> MaterialTheme.colorScheme.onSurfaceVariant
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = row.service, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(2f))
                    Text(text = row.unit, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1.5f))
                    Text(
                        text = if (original % 1.0 == 0.0) original.toInt().toString() else original.toString(),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = if (proposed % 1.0 == 0.0) proposed.toInt().toString() else proposed.toString(),
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = deltaText,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Bold,
                        color = deltaColor,
                        modifier = Modifier.weight(1.2f)
                    )
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
            }
        }
    }
}

/**
 * Individual assignment card displaying service, unit, and patient metrics.
 *
 * @param assignment The simulation outcome row.
 */
@Composable
fun AssignmentElevatedCard(assignment: SimulationAssignment) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = stringResource(Res.string.service_msg, assignment.service),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = stringResource(Res.string.target_unit_msg, assignment.unit),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    text = stringResource(Res.string.admitted_patients_msg, assignment.patientCount.toString()),
                    style = MaterialTheme.typography.bodyMedium
                )
                val rowDelta = assignment.delta
                if (rowDelta != null && rowDelta != 0.0) {
                    Surface(
                        color = if (rowDelta > 0) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = stringResource(
                                Res.string.delta_msg,
                                if (rowDelta > 0) "+" else "",
                                rowDelta.toString()
                            ),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (rowDelta > 0) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }
}
