/**
 * Unit tests verifying strongly typed domain identifiers, clinical enumerations, and value models.
 */
package io.healthplatform.pulsequery.core.model

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

/**
 * Comprehensive unit test suite for `DomainTypes.kt`.
 */
class DomainTypesTest {

    @Test
    fun testValueClassesAndSerialization() {
        val dashId = DashboardId("d-1")
        val widgetId = WidgetId("w-1")
        val convId = ConversationId("c-1")
        val msgId = MessageId("m-1")
        val candId = CandidateId("cand-1")
        val userId = UserId("u-1")
        val ruleId = AlertRuleId("r-1")
        val colName = ColumnName("patient_count")

        assertEquals("d-1", dashId.value)
        assertEquals("w-1", widgetId.value)
        assertEquals("c-1", convId.value)
        assertEquals("m-1", msgId.value)
        assertEquals("cand-1", candId.value)
        assertEquals("u-1", userId.value)
        assertEquals("r-1", ruleId.value)
        assertEquals("patient_count", colName.value)

        assertEquals(dashId, Json.decodeFromString<DashboardId>(Json.encodeToString(dashId)))
        assertEquals(widgetId, Json.decodeFromString<WidgetId>(Json.encodeToString(widgetId)))
        assertEquals(convId, Json.decodeFromString<ConversationId>(Json.encodeToString(convId)))
        assertEquals(msgId, Json.decodeFromString<MessageId>(Json.encodeToString(msgId)))
        assertEquals(candId, Json.decodeFromString<CandidateId>(Json.encodeToString(candId)))
        assertEquals(userId, Json.decodeFromString<UserId>(Json.encodeToString(userId)))
        assertEquals(ruleId, Json.decodeFromString<AlertRuleId>(Json.encodeToString(ruleId)))
        assertEquals(colName, Json.decodeFromString<ColumnName>(Json.encodeToString(colName)))
    }

    @Test
    fun testClinicalEnumsAndFromWire() {
        assertEquals(ClinicalRole.ADMIN, ClinicalRole.fromWire("admin"))
        assertEquals(ClinicalRole.PHYSICIAN, ClinicalRole.fromWire("PHYSICIAN"))
        assertEquals(ClinicalRole.CHARGE_NURSE, ClinicalRole.fromWire("charge_nurse"))
        assertEquals(ClinicalRole.ANALYST, ClinicalRole.fromWire("unknown"))

        assertEquals(MessageAuthorRole.USER, MessageAuthorRole.fromWire("user"))
        assertEquals(MessageAuthorRole.ASSISTANT, MessageAuthorRole.fromWire("ASSISTANT"))
        assertEquals(MessageAuthorRole.USER, MessageAuthorRole.fromWire("other"))

        assertEquals(WidgetSourceType.SQL, WidgetSourceType.fromWire("sql"))
        assertEquals(WidgetSourceType.HTTP, WidgetSourceType.fromWire("HTTP"))
        assertEquals(WidgetSourceType.TEXT, WidgetSourceType.fromWire("text"))
        assertEquals(WidgetSourceType.SQL, WidgetSourceType.fromWire("invalid"))

        assertEquals(VisualizationType.TABLE, VisualizationType.fromWire("table"))
        assertEquals(VisualizationType.BAR_CHART, VisualizationType.fromWire("bar_chart"))
        assertEquals(VisualizationType.LINE_CHART, VisualizationType.fromWire("line_chart"))
        assertEquals(VisualizationType.PIE_CHART, VisualizationType.fromWire("pie_chart"))
        assertEquals(VisualizationType.HEATMAP, VisualizationType.fromWire("heatmap"))
        assertEquals(VisualizationType.METRIC, VisualizationType.fromWire("metric"))
        assertEquals(VisualizationType.MARKDOWN, VisualizationType.fromWire("markdown"))
        assertEquals(VisualizationType.TABLE, VisualizationType.fromWire("unknown"))

        assertEquals(WidgetHttpMethod.GET, WidgetHttpMethod.fromWire("get"))
        assertEquals(WidgetHttpMethod.POST, WidgetHttpMethod.fromWire("POST"))
        assertEquals(WidgetHttpMethod.PUT, WidgetHttpMethod.fromWire("put"))
        assertEquals(WidgetHttpMethod.GET, WidgetHttpMethod.fromWire("unknown"))

        assertEquals(MpaxArenaEvaluationMode.SQL_VS_MPAX, MpaxArenaEvaluationMode.fromWire("sql_vs_mpax"))
        assertEquals(MpaxArenaEvaluationMode.PROMPT_SENSITIVITY, MpaxArenaEvaluationMode.fromWire("prompt_sensitivity"))
        assertEquals(MpaxArenaEvaluationMode.CONSTRAINT_STRESS, MpaxArenaEvaluationMode.fromWire("constraint_stress"))
        assertEquals(MpaxArenaEvaluationMode.SQL_VS_MPAX, MpaxArenaEvaluationMode.fromWire("other"))

        assertEquals(SimulationOutcomeStatus.OPTIMAL, SimulationOutcomeStatus.fromWire("OPTIMAL"))
        assertEquals(SimulationOutcomeStatus.SUCCESS, SimulationOutcomeStatus.fromWire("success"))
        assertEquals(SimulationOutcomeStatus.INFEASIBLE, SimulationOutcomeStatus.fromWire("infeasible"))
        assertEquals(SimulationOutcomeStatus.ERROR, SimulationOutcomeStatus.fromWire("error"))
        assertEquals(SimulationOutcomeStatus.ERROR, SimulationOutcomeStatus.fromWire("unknown"))

        assertEquals(ConstraintRuleType.FORCE_FLOW, ConstraintRuleType.fromWire("force_flow"))
        assertEquals(ConstraintRuleType.MIN_CAPACITY, ConstraintRuleType.fromWire("min_capacity"))
        assertEquals(ConstraintRuleType.MAX_CAPACITY, ConstraintRuleType.fromWire("max_capacity"))
        assertEquals(ConstraintRuleType.FORCE_FLOW, ConstraintRuleType.fromWire("other"))
    }

    @Test
    fun testSqlCellValueAndChartDataPoint() {
        val cells: List<SqlCellValue> = listOf(
            SqlCellValue.TextCell("ICU"),
            SqlCellValue.NumberCell(95.5),
            SqlCellValue.BooleanCell(true),
            SqlCellValue.NullCell
        )
        assertEquals("ICU", (cells[0] as SqlCellValue.TextCell).text)
        assertEquals(95.5, (cells[1] as SqlCellValue.NumberCell).number)
        assertEquals(true, (cells[2] as SqlCellValue.BooleanCell).flag)
        assertEquals(SqlCellValue.NullCell, cells[3])

        val pt1 = ChartDataPoint("Ward A", 42f)
        val pt2 = pt1.copy(value = 50f)
        assertEquals("Ward A", pt1.label)
        assertEquals(42f, pt1.value)
        assertNotEquals(pt1, pt2)
    }
}
