/**
 * End-to-end integration tests for hospital capacity simulation API and [SimulationViewModel] workflows.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.models.ScenarioRunRequest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.simulation.SimulationViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Verifies the What-If hospital capacity simulation API and [SimulationViewModel] state transitions.
 */
class SimulationE2EWorkflowsTest {

    /**
     * Verifies that [AppContainer.simulationApi] and [SimulationViewModel] execute optimization scenarios
     * against the mock HTTP engine and populate unit assignment results.
     */
    @Test
    fun testSimulationWorkflow() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        AppContainer.setHttpClientForTest(createMockClient())

        val response = AppContainer.simulationApi.runSimulationApiV1SimulationRunPost(
            ScenarioRunRequest(
                demandSourceSql = "SELECT Clinical_Service, COUNT(*) as Patient_Count FROM visits GROUP BY 1",
                capacityParameters = mapOf("ICU" to 20.0, "MedSurg" to 50.0)
            )
        )
        assertTrue(response.success, "Simulation API request failed")
        val body = response.body()
        assertEquals("optimal", body.status)
        assertTrue(body.assignments.isNotEmpty(), "Expected non-empty simulation assignments")

        val viewModel = SimulationViewModel(
            scope = this,
            simulationApi = AppContainer.simulationApi,
            schemaApi = AppContainer.schemaApi
        )
        viewModel.runSimulation()
        val finalState = viewModel.state.first { !it.isLoading && it.result != null }
        assertNull(finalState.errorMessage)
        val simResult = finalState.result
        assertNotNull(simResult)
        assertEquals("optimal", simResult.status)
        AppContainer.resetForTest()
    }
}
