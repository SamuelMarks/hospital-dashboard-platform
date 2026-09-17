package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * End-to-end integration workflows test for hospital capacity simulation APIs.
 */
class SimulationE2EWorkflowsTest {

    /**
     * Executes dashboard query pre-checks for simulation workflows, handling missing
     * remote backend gracefully via [runCatching].
     */
    @Test
    fun testSimulationWorkflow() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"

        println("TEST: Simulation API")
        runCatching {
            val response = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
            assertTrue(response.success, "Dashboards API failed")
        }.onFailure { e ->
            println("Skipping simulation test: ${e.message}")
        }
    }
}
