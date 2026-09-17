package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.runComposeUiTest
import kotlin.test.Test

/**
 * Semantics and UI tests for [HeatmapChart].
 */
class HeatmapChartTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testHeatmapChartRendering() = runComposeUiTest {
        val columns = listOf("Unit", "Day", "Occupancy")
        val rows = listOf(
            listOf("ICU", "Mon", "18"),
            listOf("ICU", "Tue", "20.5"),
            listOf("MedSurg", "Mon", "35"),
            listOf("MedSurg", "Tue", "42")
        )

        setContent {
            MaterialTheme {
                HeatmapChart(columns = columns, rows = rows)
            }
        }

        onNodeWithContentDescription("Heatmap matrix with 2 rows and 2 columns.").assertExists()
        onNodeWithText("ICU").assertExists()
        onNodeWithText("MedSurg").assertExists()
        onNodeWithText("Mon").assertExists()
        onNodeWithText("Tue").assertExists()
        onNodeWithText("18").assertExists()
        onNodeWithText("20.5").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testHeatmapChartInsufficientDimensions() = runComposeUiTest {
        val columns = listOf("Unit", "Occupancy")
        val rows = listOf(listOf("ICU", "18"))

        setContent {
            MaterialTheme {
                HeatmapChart(columns = columns, rows = rows)
            }
        }

        onNodeWithText("Insufficient matrix dimensions for heatmap (requires at least 3 columns).").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testHeatmapChartEmptyRows() = runComposeUiTest {
        val columns = listOf("Unit", "Day", "Occupancy")

        setContent {
            MaterialTheme {
                HeatmapChart(columns = columns, rows = emptyList())
            }
        }

        onNodeWithText("Insufficient matrix dimensions for heatmap (requires at least 3 columns).").assertExists()
    }
}
