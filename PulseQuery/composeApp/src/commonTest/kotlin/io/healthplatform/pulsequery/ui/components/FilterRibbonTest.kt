/**
 * Compose UI and semantics tests for [FilterRibbon].
 */
package io.healthplatform.pulsequery.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.testing.BaseComposeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Unit and UI tests for [FilterRibbon] and its filter normalization helpers.
 */
class FilterRibbonTest : BaseComposeTest() {

    @Test
    fun testFilterRibbonPureHelpers() {
        assertTrue(CLINICAL_DEPARTMENTS.contains("Cardiology"))
        assertTrue(TIME_RANGE_PRESETS.contains("Last 7 Days"))

        assertFalse(isDepartmentFilterActive(null))
        assertFalse(isDepartmentFilterActive("All Departments"))
        assertTrue(isDepartmentFilterActive("Cardiology"))

        assertFalse(isTimeRangeFilterActive(null))
        assertFalse(isTimeRangeFilterActive("All Time"))
        assertTrue(isTimeRangeFilterActive("Last 7 Days"))

        assertFalse(hasAnyActiveFilter(null, null))
        assertFalse(hasAnyActiveFilter("All Departments", "All Time"))
        assertTrue(hasAnyActiveFilter("Cardiology", null))
        assertTrue(hasAnyActiveFilter(null, "Last 7 Days"))

        assertNull(normalizeDepartmentSelection("All Departments"))
        assertEquals("Cardiology", normalizeDepartmentSelection("Cardiology"))

        assertNull(normalizeTimeRangeSelection("All Time"))
        assertEquals("Last 24 Hours", normalizeTimeRangeSelection("Last 24 Hours"))
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testFilterRibbonInteractionsAndReset() = runComposeUiTest {
        var lastDept: String? = "Cardiology"
        var lastTime: String? = "Last 7 Days"
        var resetCalled = false

        setContent {
            MaterialTheme {
                FilterRibbon(
                    activeDepartment = "Cardiology",
                    activeTimeRange = "Last 7 Days",
                    onFiltersChanged = { d, t ->
                        lastDept = d
                        lastTime = t
                    },
                    onResetFilters = { resetCalled = true }
                )
            }
        }

        onNodeWithText("Cardiology").assertExists().performClick()
        waitForIdle()
        onNodeWithText("All Departments").performClick()
        waitForIdle()
        assertNull(lastDept)

        onNodeWithText("Last 7 Days").assertExists().performClick()
        waitForIdle()
        onNodeWithText("All Time").performClick()
        waitForIdle()
        assertNull(lastTime)

        onNodeWithContentDescription("Clear Filters").assertExists().performClick()
        assertTrue(resetCalled)
    }
}
