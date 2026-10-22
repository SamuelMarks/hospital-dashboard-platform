/**
 * Desktop JVM Compose UI integration test for [AnalyticsScreen].
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
 * Verifies that [AnalyticsScreen] renders the LLM Analytics workspace on JVM.
 */
class AnalyticsScreenE2ETest {
    /**
     * Mounts [AnalyticsScreen] with the mock HTTP client and asserts the LLM Analytics header is displayed.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenRenders() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createMockClient())
        setContent { AnalyticsScreen() }
        onNodeWithText("LLM Analytics", substring = true).assertIsDisplayed()
    }
}
