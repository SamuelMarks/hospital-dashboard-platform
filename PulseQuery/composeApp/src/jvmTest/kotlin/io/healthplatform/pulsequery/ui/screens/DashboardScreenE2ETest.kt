package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import kotlin.test.Test
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.createMockClient

class DashboardScreenE2ETest {
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardScreenRenders() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createMockClient())
        setContent { DashboardScreen() }
        onNodeWithText("Dashboards", substring = true).assertIsDisplayed()
    }
}
