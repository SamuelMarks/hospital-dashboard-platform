/**
 * Desktop JVM Compose UI integration test for [DashboardScreen].
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
 * Verifies that [DashboardScreen] renders the active hospital dashboard and its widgets on JVM.
 */
class DashboardScreenE2ETest {
    /**
     * Mounts [DashboardScreen] with the mock HTTP client and asserts the loaded dashboard title is displayed.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardScreenRenders() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createMockClient())
        setContent { DashboardScreen() }
        waitForIdle()
        onNodeWithText("Main", substring = true).assertIsDisplayed()
    }
}
