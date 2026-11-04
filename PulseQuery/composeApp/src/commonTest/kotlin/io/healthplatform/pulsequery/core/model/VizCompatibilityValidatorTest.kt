/**
 * Unit tests for [VizCompatibilityValidator] and [VizValidationReport].
 */
package io.healthplatform.pulsequery.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive test suite verifying `Result`-based SQL-to-visualization compatibility validation.
 */
class VizCompatibilityValidatorTest {

    /**
     * Verifies [VizCompatibilityValidator.parseFiniteNumber] across numeric, percentage, blank, and non-numeric strings.
     */
    @Test
    fun testParseFiniteNumber() {
        assertNull(VizCompatibilityValidator.parseFiniteNumber(null))
        assertNull(VizCompatibilityValidator.parseFiniteNumber("   "))
        assertNull(VizCompatibilityValidator.parseFiniteNumber("%"))
        assertNull(VizCompatibilityValidator.parseFiniteNumber("NaN"))
        assertNull(VizCompatibilityValidator.parseFiniteNumber("Infinity"))
        assertNull(VizCompatibilityValidator.parseFiniteNumber("abc"))
        assertEquals(42.5, VizCompatibilityValidator.parseFiniteNumber(" 42.5 "))
        assertEquals(-12.5, VizCompatibilityValidator.parseFiniteNumber("-12.5%"))
    }

    /**
     * Verifies general rules (markdown on SQL, empty columns, missing xKey/yKey overrides) and [VizValidationReport] properties.
     */
    @Test
    fun testGeneralAndAxisOverrides() {
        val mdFail = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "markdown",
            columns = listOf("a"),
            rows = listOf(listOf("1"))
        )
        assertTrue(mdFail.isFailure)
        assertTrue(mdFail.exceptionOrNull()?.message.orEmpty().contains("SQL_NOT_APPLICABLE_TO_MARKDOWN"))

        val emptyCols = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "pie_chart",
            columns = emptyList(),
            rows = emptyList()
        )
        assertTrue(emptyCols.isSuccess)
        val report = emptyCols.getOrNull()!!
        assertEquals(VisualizationType.PIE_CHART, report.visualization)
        assertTrue(report.isCompatible)
        assertNull(report.reason)
        assertEquals(listOf(VisualizationType.PIE_CHART), report.suggestedVisualizations)
        assertNotEquals(report, report.copy(isCompatible = false, reason = VizIncompatibilityReason.ZERO_TOTAL_PIE))

        val missingX = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "bar_chart",
            columns = listOf("unit", "cnt"),
            rows = listOf(listOf("ICU", "10")),
            xKey = "missing_x"
        )
        assertTrue(missingX.isFailure)
        assertTrue(missingX.exceptionOrNull()?.message.orEmpty().contains("MISSING_AXIS_COLUMN"))

        val missingY = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "bar_chart",
            columns = listOf("unit", "cnt"),
            rows = listOf(listOf("ICU", "10")),
            yKey = "missing_y"
        )
        assertTrue(missingY.isFailure)
        assertTrue(missingY.exceptionOrNull()?.message.orEmpty().contains("MISSING_AXIS_COLUMN"))
    }

    /**
     * Verifies [VisualizationType.PIE_CHART] compatibility and incompatibility cases.
     */
    @Test
    fun testPieChartValidation() {
        val tooFew = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "pie",
            columns = listOf("only_col"),
            rows = listOf(listOf("10"))
        )
        assertTrue(tooFew.isFailure)
        assertTrue(tooFew.exceptionOrNull()?.message.orEmpty().contains("TOO_FEW_COLUMNS_PIE"))

        val emptyRows = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "pie_chart",
            columns = listOf("unit", "cnt"),
            rows = emptyList()
        )
        assertTrue(emptyRows.isSuccess)

        val nonNumeric = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "donut",
            columns = listOf("unit", "label"),
            rows = listOf(listOf("ICU", "North"))
        )
        assertTrue(nonNumeric.isFailure)
        assertTrue(nonNumeric.exceptionOrNull()?.message.orEmpty().contains("NON_NUMERIC_VALUES_PIE"))

        val negative = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "pie_chart",
            columns = listOf("unit", "delta"),
            rows = listOf(listOf("ICU", "10"), listOf("ER", "-4"))
        )
        assertTrue(negative.isFailure)
        assertTrue(negative.exceptionOrNull()?.message.orEmpty().contains("NEGATIVE_VALUES_PIE"))

        val zeroTotal = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "pie_chart",
            columns = listOf("unit", "cnt"),
            rows = listOf(listOf("ICU", "0"), listOf("ER", "0"))
        )
        assertTrue(zeroTotal.isFailure)
        assertTrue(zeroTotal.exceptionOrNull()?.message.orEmpty().contains("ZERO_TOTAL_PIE"))

        val validPie = VizCompatibilityValidator.validateSqlResultForVisualization(
            visualization = "pie_chart",
            columns = listOf("unit", "cnt"),
            rows = listOf(listOf("ICU", "30"), listOf("ER", "70")),
            xKey = "unit",
            yKey = "cnt"
        )
        assertTrue(validPie.isSuccess)
    }

    /**
     * Verifies [VisualizationType.BAR_CHART], [VisualizationType.LINE_CHART], [VisualizationType.HEATMAP],
     * [VisualizationType.SCALAR], [VisualizationType.METRIC], and [VisualizationType.TABLE] validation.
     */
    @Test
    fun testBarLineHeatmapScalarMetricTableValidation() {
        // Bar chart
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "bar_chart",
                columns = listOf("only"),
                rows = listOf(listOf("1"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "bar_chart",
                columns = listOf("x", "y"),
                rows = emptyList()
            ).isSuccess
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "bar_chart",
                columns = listOf("x", "y"),
                rows = listOf(listOf("A", "text"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "bar_chart",
                columns = listOf("x", "y"),
                rows = listOf(listOf("A", "15"))
            ).isSuccess
        )

        // Line chart
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "line_chart",
                columns = listOf("only"),
                rows = listOf(listOf("1"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "line_chart",
                columns = listOf("x", "y"),
                rows = emptyList()
            ).isSuccess
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "line_chart",
                columns = listOf("x", "y"),
                rows = listOf(listOf("D1", "text"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "line_chart",
                columns = listOf("x", "y"),
                rows = listOf(listOf("D1", "10"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "line_chart",
                columns = listOf("x", "y"),
                rows = listOf(listOf("D1", "10"), listOf("D2", "20"))
            ).isSuccess
        )

        // Heatmap
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "heatmap",
                columns = listOf("a"),
                rows = listOf(listOf("1"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "heatmap",
                columns = listOf("a", "b"),
                rows = listOf(listOf("X", "1"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "heatmap",
                columns = listOf("a", "b", "c"),
                rows = emptyList()
            ).isSuccess
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "heatmap",
                columns = listOf("svc", "hr", "load"),
                rows = listOf(listOf("ICU", "1", "text"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "heatmap",
                columns = listOf("svc", "hr", "admits", "net_bottleneck"),
                rows = listOf(listOf("ICU", "1", "5", "-2"))
            ).isSuccess
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "heatmap",
                columns = listOf("svc", "hr", "admits", "score"),
                rows = listOf(listOf("ICU", "1", "5", "9")),
                yKey = "score"
            ).isSuccess
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "heatmap",
                columns = listOf("svc", "hr", "admits", "score"),
                rows = listOf(listOf("ICU", "1", "5", "9"))
            ).isSuccess
        )

        // Scalar
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "scalar",
                columns = listOf("dt"),
                rows = emptyList()
            ).isSuccess
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "scalar",
                columns = listOf("dt"),
                rows = listOf(listOf("2026-10-01"))
            ).isFailure
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "scalar",
                columns = listOf("prob"),
                rows = listOf(listOf("0.91"))
            ).isSuccess
        )

        // Metric and Table
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "metric",
                columns = listOf("cnt"),
                rows = listOf(listOf("42"))
            ).isSuccess
        )
        assertTrue(
            VizCompatibilityValidator.validateSqlResultForVisualization(
                visualization = "table",
                columns = listOf("cnt"),
                rows = listOf(listOf("42"))
            ).isSuccess
        )
    }
}
