/**
 * Unit tests verifying TV Form Factor Wallboard layout and focus behaviors.
 */
package io.healthplatform.pulsequery.ui.screens.tv

import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.testing.BaseComposeTest
import kotlin.test.Test

/**
 * Validates rendering and semantic properties of the TV Wallboard dashboard.
 */
@OptIn(ExperimentalTestApi::class)
class TvDashboardScreenTest : BaseComposeTest() {

    @Test
    fun testTvDashboardScreenRendersHeader() = runComposeUiTest {
        setContent {
            TvDashboardScreen()
        }

        onNodeWithText("Hospital Operations Telemetry • Live View").assertExists()
        onNodeWithText("Exit Wallboard").assertExists()
    }

    @Test
    fun testTvDashboardExitCallback() = runComposeUiTest {
        var exitCalled = false
        setContent {
            TvDashboardScreen(onExit = { exitCalled = true })
        }

        onNodeWithText("Exit Wallboard").performClick()
        assert(exitCalled)
    }
}
