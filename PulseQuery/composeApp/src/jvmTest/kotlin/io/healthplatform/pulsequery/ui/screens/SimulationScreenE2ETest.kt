package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import kotlin.test.Test
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.createMockClient

class SimulationScreenE2ETest {
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testSimulationScreenRenders() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createMockClient())
        setContent { SimulationScreen() }
        onNodeWithText("Capacity Simulation", substring = true).assertIsDisplayed()
    }
}
