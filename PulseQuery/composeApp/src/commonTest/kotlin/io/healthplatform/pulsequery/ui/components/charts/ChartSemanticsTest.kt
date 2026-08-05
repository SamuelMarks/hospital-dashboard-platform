package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToLog
import androidx.compose.ui.test.runComposeUiTest
import kotlin.test.Test

class ChartSemanticsTest {

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testBarChartSemantics() = runComposeUiTest {
        val data = listOf("A" to 10f, "B" to 20f)
        setContent {
            MaterialTheme {
                BarChart(data = data)
            }
        }

        val expectedDesc = "Bar chart with 2 items: A: 10.0, B: 20.0"
        onNodeWithContentDescription(expectedDesc).assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLineChartSemantics() = runComposeUiTest {
        val data = listOf("X" to 5f, "Y" to 15f)
        setContent {
            MaterialTheme {
                LineChart(data = data)
            }
        }

        val expectedDesc = "Line chart with 2 items: X: 5.0, Y: 15.0"
        onNodeWithContentDescription(expectedDesc).assertExists()
    }
}
