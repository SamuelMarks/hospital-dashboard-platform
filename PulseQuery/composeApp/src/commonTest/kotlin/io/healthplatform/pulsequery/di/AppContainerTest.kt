package io.healthplatform.pulsequery.di

import kotlin.test.Test
import kotlin.test.assertNotNull

/**
 * Validates the lazy dependency injection initialization inside the AppContainer.
 */
class AppContainerTest {

    /**
     * Verifies that AppContainer constructs network endpoints securely without eager execution failures.
     */
    @Test
    fun testAppContainerEndpointsAreInstantiated() {
        val container = AppContainer
        
        // Assertions triggering lazy initialization
        assertNotNull(container.httpClient, "HTTP Client should initialize securely")
        assertNotNull(container.authApi, "Auth API should initialize securely")
        assertNotNull(container.chatApi, "Chat API should initialize securely")
        assertNotNull(container.dashboardsApi, "Dashboards API should initialize securely")
        assertNotNull(container.analyticsApi, "Analytics API should initialize securely")
        assertNotNull(container.simulationApi, "Simulation API should initialize securely")
    }
}
