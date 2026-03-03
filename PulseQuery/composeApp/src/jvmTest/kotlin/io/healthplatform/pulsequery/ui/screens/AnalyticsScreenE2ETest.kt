package io.healthplatform.pulsequery.ui.screens

import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import kotlin.test.Test
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.createMockClient

class AnalyticsScreenE2ETest {
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAnalyticsScreenRenders() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createMockClient())
        setContent { AnalyticsScreen() }
        onNodeWithText("LLM Analytics", substring = true).assertIsDisplayed()
    }
}
