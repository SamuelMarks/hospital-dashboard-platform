package io.healthplatform.pulsequery.ui.screens.simulation

import io.healthplatform.pulsequery.api.apis.SchemaApi
import io.healthplatform.pulsequery.api.apis.SimulationApi
import io.healthplatform.pulsequery.api.models.ScenarioConstraint
import io.healthplatform.pulsequery.api.models.ScenarioResult
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [SimulationViewModel] and [SimulationUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class SimulationViewModelTest {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    private fun createClient(engine: MockEngine): HttpClient = HttpClient(engine) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; isLenient = true })
        }
    }

    @Test
    fun testSimulationUiStateProperties() {
        val state = SimulationUiState(
            sqlQuery = "SELECT 1",
            icuCapacity = "15",
            wardCapacity = "60",
            constraints = emptyList(),
            affinityOverrides = emptyMap(),
            availableServices = DEFAULT_SIMULATION_SERVICES,
            availableUnits = DEFAULT_SIMULATION_UNITS,
            schemaTables = listOf("admissions"),
            result = ScenarioResult(assignments = emptyList(), status = "OPTIMAL", message = "ok"),
            isLoading = false,
            errorMessage = "err"
        )
        assertEquals("SELECT 1", state.sqlQuery)
        assertEquals("15", state.icuCapacity)
        assertEquals("60", state.wardCapacity)
        assertTrue(state.constraints.isEmpty())
        assertTrue(state.affinityOverrides.isEmpty())
        assertEquals(DEFAULT_SIMULATION_SERVICES, state.availableServices)
        assertEquals(DEFAULT_SIMULATION_UNITS, state.availableUnits)
        assertEquals(listOf("admissions"), state.schemaTables)
        assertNotNull(state.result)
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testLoadSchemaTablesPopulatesSchemaTablesWithoutPollutingAvailableUnits() = kotlinx.coroutines.runBlocking {
        val schemaJson = """
            [
                {"table_name": "admissions", "columns": []},
                {"table_name": "transfers", "columns": []},
                {"table_name": "admissions", "columns": []}
            ]
        """.trimIndent()
        val engineNonEmpty = MockEngine {
            respond(
                content = schemaJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        AppContainer.setHttpClientForTest(createClient(engineNonEmpty))

        val vm = SimulationViewModel(scope = this)
        vm.loadSchemaTables()
        kotlinx.coroutines.delay(50)
        assertEquals(listOf("admissions", "transfers"), vm.state.value.schemaTables)
        assertEquals(DEFAULT_SIMULATION_UNITS, vm.state.value.availableUnits)

        // Empty schema list does not overwrite schemaTables
        val engineEmpty = MockEngine {
            respond(
                content = "[]",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val vmEmpty = SimulationViewModel(
            scope = this,
            schemaApi = SchemaApi(baseUrl = "http://localhost", httpClient = createClient(engineEmpty))
        )
        vmEmpty.loadSchemaTables()
        kotlinx.coroutines.delay(50)
        assertTrue(vmEmpty.state.value.schemaTables.isEmpty())
    }

    @Test
    fun testFieldUpdatesConstraintsAndAffinities() = kotlinx.coroutines.runBlocking {
        val vm = SimulationViewModel(scope = this)

        vm.updateSqlQuery("SELECT service, count FROM icu_demand")
        vm.updateIcuCapacity("25")
        vm.updateWardCapacity("100")
        assertEquals("SELECT service, count FROM icu_demand", vm.state.value.sqlQuery)
        assertEquals("25", vm.state.value.icuCapacity)
        assertEquals("100", vm.state.value.wardCapacity)

        val c1 = ScenarioConstraint(type = "force_flow", service = "Cardiology", unit = "CCU", min = 2.0, max = 10.0)
        val c2 = ScenarioConstraint(type = "force_flow", service = "ICU", unit = "ICU", min = 5.0, max = 20.0)
        vm.addConstraint(c1)
        vm.addConstraint(c2)
        assertEquals(2, vm.state.value.constraints.size)

        vm.removeConstraintAt(0)
        assertEquals(listOf(c2), vm.state.value.constraints)

        // Affinity overrides
        vm.putAffinityOverride("Cardiology", "CCU", 0.95)
        vm.putAffinityOverride("Cardiology", "ICU", 0.80)
        assertEquals(2, vm.state.value.affinityOverrides["Cardiology"]?.size)

        // Removing one unit leaves the service entry intact
        vm.removeAffinityOverride("Cardiology", "ICU")
        assertEquals(mapOf("CCU" to 0.95), vm.state.value.affinityOverrides["Cardiology"])

        // Removing the last unit removes the service entry
        vm.removeAffinityOverride("Cardiology", "CCU")
        assertTrue(vm.state.value.affinityOverrides.isEmpty())

        // Removing from non-existent service is a no-op
        vm.removeAffinityOverride("Unknown", "ICU")
        assertTrue(vm.state.value.affinityOverrides.isEmpty())
    }

    @Test
    fun testRunSimulationSuccessAndFailures() = kotlinx.coroutines.runBlocking {
        val resultJson = """
            {
                "status": "OPTIMAL",
                "message": "Solved",
                "assignments": [
                    {"Service": "Cardiology", "Unit": "CCU", "Patient_Count": 12.0}
                ]
            }
        """.trimIndent()
        val engine = MockEngine {
            respond(
                content = resultJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        AppContainer.setHttpClientForTest(createClient(engine))

        // Run with empty constraints/affinities and valid numeric capacities
        val vm = SimulationViewModel(scope = this)
        vm.runSimulation()
        kotlinx.coroutines.delay(50)
        assertEquals("OPTIMAL", vm.state.value.result?.status)
        assertNull(vm.state.value.errorMessage)

        // Run with non-empty constraints/affinities and non-numeric capacity fallback
        vm.updateIcuCapacity("invalid")
        vm.updateWardCapacity("invalid")
        vm.addConstraint(ScenarioConstraint(type = "force_flow", service = "ICU", unit = "ICU", min = 1.0))
        vm.putAffinityOverride("ICU", "ICU", 1.0)
        vm.runSimulation()
        kotlinx.coroutines.delay(50)
        assertNotNull(vm.state.value.result)

        // Failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("Infeasible LP") }
        val vmFail1 = SimulationViewModel(
            scope = this,
            simulationApi = SimulationApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg))
        )
        vmFail1.runSimulation("Fallback err")
        kotlinx.coroutines.delay(50)
        assertEquals("Infeasible LP", vmFail1.state.value.errorMessage)

        // Failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFail2 = SimulationViewModel(
            scope = this,
            simulationApi = SimulationApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull))
        )
        vmFail2.runSimulation()
        kotlinx.coroutines.delay(50)
        assertEquals("Simulation failed", vmFail2.state.value.errorMessage)
    }
}
