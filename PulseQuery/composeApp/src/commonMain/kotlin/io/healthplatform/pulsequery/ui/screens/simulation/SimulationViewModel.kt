/**
 * Simulation ViewModel module orchestrating hospital capacity simulations,
 * custom flow constraints, affinity overrides, and schema table discovery.
 */
package io.healthplatform.pulsequery.ui.screens.simulation

import io.healthplatform.pulsequery.api.apis.SchemaApi
import io.healthplatform.pulsequery.api.apis.SimulationApi
import io.healthplatform.pulsequery.api.models.ScenarioConstraint
import io.healthplatform.pulsequery.api.models.ScenarioResult
import io.healthplatform.pulsequery.api.models.ScenarioRunRequest
import io.healthplatform.pulsequery.core.error.UiErrorKey
import io.healthplatform.pulsequery.core.model.ConstraintRuleType
import io.healthplatform.pulsequery.core.model.SimulationOutcomeStatus
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Default list of clinical services available for capacity simulation constraints.
 */
val DEFAULT_SIMULATION_SERVICES: List<String> = listOf(
    "General Medicine",
    "General Surgery",
    "Cardiology",
    "Neurology",
    "Pediatrics",
    "ICU",
    "Orthopedics"
)

/**
 * Default list of hospital ward units available for capacity simulation allocation.
 */
val DEFAULT_SIMULATION_UNITS: List<String> = listOf(
    "ICU",
    "NICU",
    "CCU",
    "WARD_A",
    "WARD_B",
    "SURG_WARD",
    "STEPDOWN"
)

/**
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.SimulationScreen].
 *
 * @property sqlQuery Demand SQL query returning clinical service admission counts.
 * @property icuCapacity Configured ICU bed capacity string.
 * @property wardCapacity Configured general ward bed capacity string.
 * @property constraints List of hard flow constraints applied to the scenario.
 * @property affinityOverrides Nested map of service-to-unit affinity score overrides.
 * @property availableServices List of clinical services selectable in constraint/affinity dialogs.
 * @property availableUnits List of hospital ward units selectable in constraint/affinity dialogs.
 * @property schemaTables Database table names discovered from [SchemaApi], kept separate from [availableUnits].
 * @property result Latest [ScenarioResult] returned by the simulation engine, or null.
 * @property isLoading Whether a simulation run is currently executing.
 * @property errorMessage User-visible error message if a simulation run fails.
 */
data class SimulationUiState(
    val sqlQuery: String = "SELECT service, count FROM incoming_patients",
    val icuCapacity: String = "10",
    val wardCapacity: String = "50",
    val constraints: List<ScenarioConstraint> = emptyList(),
    val affinityOverrides: Map<String, Map<String, Double>> = emptyMap(),
    val availableServices: List<String> = DEFAULT_SIMULATION_SERVICES,
    val availableUnits: List<String> = DEFAULT_SIMULATION_UNITS,
    val schemaTables: List<String> = emptyList(),
    val result: ScenarioResult? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null
) {
    /** Strongly typed [SimulationOutcomeStatus] resolved from [result], or null when no result is present. */
    val outcomeStatus: SimulationOutcomeStatus?
        get() {
            val currentResult = result ?: return null
            return SimulationOutcomeStatus.fromWire(currentResult.status)
        }

    /** True when [outcomeStatus] represents a successful or optimal solver run. */
    val isSuccessOutcome: Boolean
        get() = outcomeStatus == SimulationOutcomeStatus.SUCCESS || outcomeStatus == SimulationOutcomeStatus.OPTIMAL
}

/**
 * ViewModel managing state and backend calls for hospital capacity simulation scenarios.
 *
 * @property scope Coroutine scope used for asynchronous API operations.
 * @property simulationApi Optional explicit [SimulationApi] client for executing MPAX capacity simulations.
 * @property schemaApi Optional explicit [SchemaApi] client for inspecting database schema tables.
 */
class SimulationViewModel(
    private val scope: CoroutineScope,
    private val simulationApi: SimulationApi? = null,
    private val schemaApi: SchemaApi? = null
) {
    private val currentSimulationApi: SimulationApi
        get() = simulationApi ?: AppContainer.simulationApi

    private val currentSchemaApi: SchemaApi
        get() = schemaApi ?: AppContainer.schemaApi

    private val _state = MutableStateFlow(SimulationUiState())

    /** Reactive [StateFlow] of the current [SimulationUiState]. */
    val state: StateFlow<SimulationUiState> = _state.asStateFlow()

    /**
     * Fetches database schema tables from [SchemaApi] and stores them in [SimulationUiState.schemaTables]
     * without polluting [SimulationUiState.availableUnits].
     */
    fun loadSchemaTables() {
        scope.launch {
            runCatchingPulseAsync {
                currentSchemaApi.getDatabaseSchemaApiV1SchemaGet().asResult().getOrThrow()
            }.onSuccess { tables ->
                if (tables.isNotEmpty()) {
                    val tableNames = tables.map { it.tableName }.distinct()
                    _state.update { it.copy(schemaTables = tableNames) }
                }
            }
        }
    }

    /**
     * Updates the demand source SQL query string.
     *
     * @param sql Updated SQL query string.
     */
    fun updateSqlQuery(sql: String) {
        _state.update { it.copy(sqlQuery = sql) }
    }

    /**
     * Updates the ICU capacity parameter string.
     *
     * @param capacity Updated ICU bed capacity string.
     */
    fun updateIcuCapacity(capacity: String) {
        _state.update { it.copy(icuCapacity = capacity) }
    }

    /**
     * Updates the general ward capacity parameter string.
     *
     * @param capacity Updated ward bed capacity string.
     */
    fun updateWardCapacity(capacity: String) {
        _state.update { it.copy(wardCapacity = capacity) }
    }

    /**
     * Appends a new hard [ScenarioConstraint] to the active simulation configuration.
     *
     * @param constraint The [ScenarioConstraint] to add.
     */
    fun addConstraint(constraint: ScenarioConstraint) {
        _state.update { it.copy(constraints = it.constraints + constraint) }
    }

    /**
     * Appends a new constraint constructed from a strongly typed [ConstraintRuleType].
     *
     * @param type Strongly typed [ConstraintRuleType] (defaults to [ConstraintRuleType.FORCE_FLOW]).
     * @param service Clinical service name.
     * @param unit Hospital unit name.
     * @param min Optional minimum patient flow bound.
     * @param max Optional maximum patient flow bound.
     */
    fun addConstraintRule(
        type: ConstraintRuleType,
        service: String,
        unit: String,
        min: Double?,
        max: Double?
    ) {
        addConstraint(
            ScenarioConstraint(
                type = type.wireValue,
                service = service,
                unit = unit,
                min = min,
                max = max
            )
        )
    }

    /**
     * Removes a [ScenarioConstraint] at the specified [index].
     *
     * @param index Zero-based index of the constraint to remove.
     */
    fun removeConstraintAt(index: Int) {
        _state.update { current ->
            current.copy(constraints = current.constraints.filterIndexed { i, _ -> i != index })
        }
    }

    /**
     * Adds or updates an affinity score override for a given clinical [service] and hospital [unit].
     *
     * @param service Clinical service name.
     * @param unit Hospital ward unit name.
     * @param score Affinity weight score.
     */
    fun putAffinityOverride(service: String, unit: String, score: Double) {
        _state.update { current ->
            val existing = current.affinityOverrides[service].orEmpty().toMutableMap()
            existing[unit] = score
            val mutableRoot = current.affinityOverrides.toMutableMap()
            mutableRoot[service] = existing.toMap()
            current.copy(affinityOverrides = mutableRoot.toMap())
        }
    }

    /**
     * Removes an affinity score override for a given clinical [service] and hospital [unit].
     *
     * @param service Clinical service name.
     * @param unit Hospital ward unit name.
     */
    fun removeAffinityOverride(service: String, unit: String) {
        _state.update { current ->
            val unitMap = current.affinityOverrides[service] ?: return@update current
            val mutableSrv = unitMap.toMutableMap()
            mutableSrv.remove(unit)
            val mutableRoot = current.affinityOverrides.toMutableMap()
            if (mutableSrv.isEmpty()) {
                mutableRoot.remove(service)
            } else {
                mutableRoot[service] = mutableSrv.toMap()
            }
            current.copy(affinityOverrides = mutableRoot.toMap())
        }
    }

    /**
     * Executes the capacity simulation scenario using the current state parameters.
     *
     * @param fallbackError Default error message if the exception has no message.
     */
    fun runSimulation(fallbackError: String = UiErrorKey.SIMULATION_FAILED.fallbackMessage) {
        val snapshot = _state.value
        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null, result = null) }
            runCatchingPulseAsync {
                val req = ScenarioRunRequest(
                    demandSourceSql = snapshot.sqlQuery,
                    capacityParameters = mapOf(
                        "ICU" to (snapshot.icuCapacity.toDoubleOrNull() ?: 10.0),
                        "WARD" to (snapshot.wardCapacity.toDoubleOrNull() ?: 50.0)
                    ),
                    constraints = if (snapshot.constraints.isNotEmpty()) snapshot.constraints else null,
                    affinityOverrides = if (snapshot.affinityOverrides.isNotEmpty()) snapshot.affinityOverrides else null
                )
                currentSimulationApi.runSimulationApiV1SimulationRunPost(req).asResult().getOrThrow()
            }.fold(
                onSuccess = { res ->
                    _state.update { it.copy(result = res, isLoading = false, errorMessage = null) }
                },
                onFailure = { e ->
                    _state.update {
                        it.copy(
                            errorMessage = e.messageOrDefault(fallbackError),
                            isLoading = false
                        )
                    }
                }
            )
        }
    }
}
