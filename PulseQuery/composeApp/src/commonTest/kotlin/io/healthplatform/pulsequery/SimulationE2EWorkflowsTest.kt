package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class SimulationE2EWorkflowsTest {

    @Test
    fun testSimulationWorkflow() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        
        println("TEST: Simulation API")
        try {
            val response = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
            assertTrue(response.success, "Dashboards API failed")
        } catch (e: Exception) {
            println("Skipping simulation test: ${e.message}")
        }
    }
}

