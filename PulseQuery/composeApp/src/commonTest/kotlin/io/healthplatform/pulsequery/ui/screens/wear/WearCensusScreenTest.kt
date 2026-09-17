/**
 * Unit tests verifying Wearable Form Factor census and alert tile layouts.
 */
package io.healthplatform.pulsequery.ui.screens.wear

import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.testing.BaseComposeTest
import kotlin.test.Test

/**
 * Validates rendering and semantic content of the Wear OS Census screen.
 */
@OptIn(ExperimentalTestApi::class)
class WearCensusScreenTest : BaseComposeTest() {

    @Test
    fun testWearCensusScreenRendersGlanceableKPIs() = runComposeUiTest {
        setContent {
            WearCensusScreen()
        }

        onNodeWithText("Pulse Watch").assertExists()
        onNodeWithText("HOSPITAL CENSUS").assertExists()
        onNodeWithText("88%").assertExists()
        onNodeWithText("42 Beds Open").assertExists()
    }

    @Test
    fun testWearExitCallback() = runComposeUiTest {
        var exitCalled = false
        setContent {
            WearCensusScreen(onExit = { exitCalled = true })
        }

        onNodeWithText("Exit").performClick()
        assert(exitCalled)
    }
}
