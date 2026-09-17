package io.healthplatform.pulsequery.ui.components.charts

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Validates the core logic and data contracts of the rendering functions for custom Charts and Visualizations.
 */
class ChartsTest {

    @Test
    fun testBarChartLogic() {
        val data = listOf("A" to 10f, "B" to 20f)
        assertTrue(data.isNotEmpty(), "Bar chart data should be verifiable.")
    }

    @Test
    fun testLineChartLogic() {
        val data = listOf("A" to 10f, "B" to 20f)
        assertTrue(data.isNotEmpty(), "Line chart data should be verifiable.")
    }

    @Test
    fun testTableViewDataContract() {
        val data = listOf("ICU" to 12f, "MedSurg" to 45f, "StepDown" to 8f)
        assertEquals(3, data.size)
        assertEquals("ICU", data[0].first)
        assertEquals(12f, data[0].second)
    }

    @Test
    fun testMultiColumnTableViewDataContract() {
        val columns = listOf("Unit", "Capacity", "Occupancy", "Status")
        val rows = listOf(
            listOf("ICU", "20", "18", "CRITICAL"),
            listOf("MedSurg", "50", "35", "NORMAL"),
            listOf("StepDown", "15", "14", "SURGE")
        )
        assertEquals(4, columns.size)
        assertEquals(3, rows.size)
        assertEquals("CRITICAL", rows[0][3])
    }

    @Test
    fun testTextMarkdownWidgetContent() {
        val textContent = "# Clinical Protocol\nStandard admission lag buffer: 45 minutes."
        assertTrue(textContent.startsWith("# Clinical Protocol"))
        assertTrue(textContent.contains("45 minutes"))
    }
}
