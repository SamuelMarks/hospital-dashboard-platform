package io.healthplatform.pulsequery.ui.components.charts

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.runComposeUiTest
import kotlin.test.Test

/**
 * Semantics and rendering tests for all chart and visualization components.
 */
class ChartSemanticsTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

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
    fun testBarChartEmptyData() = runComposeUiTest {
        setContent {
            MaterialTheme {
                BarChart(data = emptyList())
            }
        }
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

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLineChartEmptyData() = runComposeUiTest {
        setContent {
            MaterialTheme {
                LineChart(data = emptyList())
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testPieChartSemantics() = runComposeUiTest {
        val data = listOf("ICU" to 30f, "NICU" to 20f, "SURG" to 50f)
        setContent {
            MaterialTheme {
                PieChart(data = data)
            }
        }

        val expectedDesc = "Pie chart with 3 slices: ICU: 30.0, NICU: 20.0, SURG: 50.0"
        onNodeWithContentDescription(expectedDesc).assertExists()
        onNodeWithText("ICU").assertExists()
        onNodeWithText("NICU").assertExists()
        onNodeWithText("SURG").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testPieChartEmptyData() = runComposeUiTest {
        setContent {
            MaterialTheme {
                PieChart(data = emptyList())
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testMetricCardSemanticsSingleValue() = runComposeUiTest {
        val data = listOf("Total Census" to 142f)
        setContent {
            MaterialTheme {
                MetricCard(data = data)
            }
        }

        onNodeWithContentDescription("Metric Total Census: 142").assertExists()
        onNodeWithText("142").assertExists()
        onNodeWithText("Total Census").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testMetricCardSemanticsMultipleValues() = runComposeUiTest {
        val data = listOf("Occupancy" to 85.5f, "Available Beds" to 12f)
        setContent {
            MaterialTheme {
                MetricCard(data = data)
            }
        }

        onNodeWithContentDescription("Metric Occupancy: 85.5").assertExists()
        onNodeWithText("85.5").assertExists()
        onNodeWithText("Occupancy").assertExists()
        onNodeWithText("Available Beds").assertExists()
        onNodeWithText("12").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testMetricCardEmptyData() = runComposeUiTest {
        setContent {
            MaterialTheme {
                MetricCard(data = emptyList())
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testTableViewSemantics() = runComposeUiTest {
        val data = listOf("ICU" to 15f, "CCU" to 8.5f)
        setContent {
            MaterialTheme {
                TableView(data = data)
            }
        }

        val expectedDesc = "Table view with 2 items: ICU: 15.0, CCU: 8.5"
        onNodeWithContentDescription(expectedDesc).assertExists()
        onNodeWithText("Metric / Label").assertExists()
        onNodeWithText("Value").assertExists()
        onNodeWithText("ICU").assertExists()
        onNodeWithText("15").assertExists()
        onNodeWithText("CCU").assertExists()
        onNodeWithText("8.5").assertExists()
    }
}
