/**
 * Desktop JVM Compose UI integration test for [SimulationScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.createMockClient
import io.healthplatform.pulsequery.di.AppContainer
import kotlin.test.Test

/**
 * Verifies that [SimulationScreen] renders the Capacity Simulation workspace on JVM.
 */
class SimulationScreenE2ETest {
    /**
     * Mounts [SimulationScreen] with the mock HTTP client and asserts the Capacity Simulation header is displayed.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testSimulationScreenRenders() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createMockClient())
        setContent { SimulationScreen() }
        onNodeWithText("Capacity Simulation", substring = true).assertIsDisplayed()
    }
}
