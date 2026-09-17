/**
 * Component for rendering the SimulationScreen.
 * Provides the main user interface for capacity simulation with advanced constraint editing.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import io.healthplatform.pulsequery.api.models.ScenarioResult
import io.healthplatform.pulsequery.api.models.ScenarioRunRequest
import io.healthplatform.pulsequery.api.models.SimulationAssignment
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.components.DatabaseErrorCard
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Screen for running complex capacity simulations with custom constraints and affinity overrides.
 *
 * @param customScope Optional custom coroutine scope for tests or lifecycle override.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SimulationScreen(
    customScope: CoroutineScope? = null
) {
    var sqlQuery by remember { mutableStateOf("SELECT service, count FROM incoming_patients") }
    var icuCapacity by remember { mutableStateOf("10") }
    var wardCapacity by remember { mutableStateOf("50") }

    var constraints by remember { mutableStateOf<List<ScenarioConstraint>>(emptyList()) }
    var affinityOverrides by remember { mutableStateOf<Map<String, Map<String, Double>>>(emptyMap()) }

    var showAddConstraintDialog by remember { mutableStateOf(false) }
    var showAddAffinityDialog by remember { mutableStateOf(false) }

    var availableServices by remember {
        mutableStateOf(
            listOf(
                "General Medicine",
                "General Surgery",
                "Cardiology",
                "Neurology",
                "Pediatrics",
                "ICU",
                "Orthopedics"
            )
        )
    }
    var availableUnits by remember {
        mutableStateOf(
            listOf(
                "ICU",
                "NICU",
                "CCU",
                "WARD_A",
                "WARD_B",
                "SURG_WARD",
                "STEPDOWN"
            )
        )
    }

    var result by remember { mutableStateOf<ScenarioResult?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val isDatabaseHealthy by AppContainer.networkHealthRepository.isDatabaseHealthy.collectAsState()
    val healthState by AppContainer.networkHealthRepository.healthState.collectAsState()

    val scope = customScope ?: rememberCoroutineScope()
    val errSimFailed = stringResource(Res.string.simulation_failed)

    LaunchedEffect(Unit) {
        runCatching {
            AppContainer.schemaApi.getDatabaseSchemaApiV1SchemaGet().body()
        }.onSuccess { tables ->
            if (tables.isNotEmpty()) {
                val tableNames = tables.map { it.tableName }
                val enrichedUnits = (availableUnits + tableNames).distinct()
                availableUnits = enrichedUnits
            }
        }
    }

    fun runSimulation() {
        scope.launch {
            isLoading = true
            errorMessage = null
            result = null
            runCatching {
                val req = ScenarioRunRequest(
                    demandSourceSql = sqlQuery,
                    capacityParameters = mapOf(
                        "ICU" to (icuCapacity.toDoubleOrNull() ?: 10.0),
                        "WARD" to (wardCapacity.toDoubleOrNull() ?: 50.0)
                    ),
                    constraints = if (constraints.isNotEmpty()) constraints else null,
                    affinityOverrides = if (affinityOverrides.isNotEmpty()) affinityOverrides else null
                )
                val response = AppContainer.simulationApi.runSimulationApiV1SimulationRunPost(req)
                response.body()
            }.fold(
                onSuccess = { res ->
                    result = res
                },
                onFailure = { e ->
                    errorMessage = e.message ?: errSimFailed
                }
            )
            isLoading = false
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
                modifier = Modifier.semantics { contentDescription = "Run Simulation" },
                icon = {
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    } else {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    }
                },
                text = { Text(stringResource(Res.string.run_simulation)) },
                expanded = !isLoading
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
                    value = sqlQuery,
                    onValueChange = { sqlQuery = it },
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

                        if (constraints.isEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = stringResource(Res.string.no_constraints_added),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            Spacer(modifier = Modifier.height(8.dp))
                            constraints.forEachIndexed { index, c ->
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
                                            constraints = constraints.filterIndexed { i, _ -> i != index }
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

                        if (affinityOverrides.isEmpty()) {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = stringResource(Res.string.no_affinities_added),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        } else {
                            Spacer(modifier = Modifier.height(8.dp))
                            affinityOverrides.forEach { (srv, unitMap) ->
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
                                                val mutableSrv = unitMap.toMutableMap()
                                                mutableSrv.remove(unit)
                                                val mutableRoot = affinityOverrides.toMutableMap()
                                                if (mutableSrv.isEmpty()) {
                                                    mutableRoot.remove(srv)
                                                } else {
                                                    mutableRoot[srv] = mutableSrv
                                                }
                                                affinityOverrides = mutableRoot
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

            if (errorMessage != null) {
                item {
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
            }

            result?.let { res ->
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
                availableServices = availableServices,
                availableUnits = availableUnits,
                onDismiss = { showAddConstraintDialog = false },
                onAdd = { newConstraint ->
                    constraints = constraints + newConstraint
                    showAddConstraintDialog = false
                }
            )
        }

        // Add Affinity Dialog
        if (showAddAffinityDialog) {
            AddAffinityDialog(
                availableServices = availableServices,
                availableUnits = availableUnits,
                onDismiss = { showAddAffinityDialog = false },
                onAdd = { srv, unt, score ->
                    val existing = affinityOverrides[srv]?.toMutableMap() ?: mutableMapOf()
                    existing[unt] = score
                    val mutableRoot = affinityOverrides.toMutableMap()
                    mutableRoot[srv] = existing
                    affinityOverrides = mutableRoot
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
                        modifier = Modifier.menuAnchor().fillMaxWidth()
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
                        modifier = Modifier.menuAnchor().fillMaxWidth()
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
                        modifier = Modifier.menuAnchor().fillMaxWidth()
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
                        modifier = Modifier.menuAnchor().fillMaxWidth()
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
                if (assignment.delta != null && assignment.delta != 0.0) {
                    Surface(
                        color = if (assignment.delta > 0) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = stringResource(
                                Res.string.delta_msg,
                                if (assignment.delta > 0) "+" else "",
                                assignment.delta.toString()
                            ),
                            style = MaterialTheme.typography.labelMedium,
                            color = if (assignment.delta > 0) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }
}
