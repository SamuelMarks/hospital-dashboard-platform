/**
 * Unit tests verifying strongly typed domain identifiers, clinical enumerations, and value models.
 */
package io.healthplatform.pulsequery.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

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

        assertEquals(OptimizationUseCaseType.SERVICE_UNIT, OptimizationUseCaseType.fromWire("service_unit"))
        assertEquals(OptimizationUseCaseType.SURGICAL_SCHEDULING, OptimizationUseCaseType.fromWire("surgical_scheduling"))
        assertEquals(OptimizationUseCaseType.STAFFING_OPTIMIZATION, OptimizationUseCaseType.fromWire("staffing_optimization"))
        assertEquals(OptimizationUseCaseType.SERVICE_UNIT, OptimizationUseCaseType.fromWire("other"))

        assertEquals(
            io.healthplatform.pulsequery.network.SseEventType.START,
            io.healthplatform.pulsequery.network.SseEventType.fromWire("start")
        )
        assertEquals(
            io.healthplatform.pulsequery.network.SseEventType.TOKEN,
            io.healthplatform.pulsequery.network.SseEventType.fromWire("token")
        )
        assertEquals(
            io.healthplatform.pulsequery.network.SseEventType.DONE,
            io.healthplatform.pulsequery.network.SseEventType.fromWire("done")
        )
        assertEquals(
            io.healthplatform.pulsequery.network.SseEventType.ERROR,
            io.healthplatform.pulsequery.network.SseEventType.fromWire("error")
        )
        assertEquals(
            io.healthplatform.pulsequery.network.SseEventType.UNKNOWN,
            io.healthplatform.pulsequery.network.SseEventType.fromWire("heartbeat")
        )

        assertEquals(
            io.healthplatform.pulsequery.network.CollaborationEventType.USER_JOINED,
            io.healthplatform.pulsequery.network.CollaborationEventType.fromWire("USER_JOINED")
        )
        assertEquals(
            io.healthplatform.pulsequery.network.CollaborationEventType.USER_LEFT,
            io.healthplatform.pulsequery.network.CollaborationEventType.fromWire("USER_LEFT")
        )
        assertEquals(
            io.healthplatform.pulsequery.network.CollaborationEventType.WIDGET_UPDATED,
            io.healthplatform.pulsequery.network.CollaborationEventType.fromWire("WIDGET_UPDATED")
        )
        assertEquals(
            io.healthplatform.pulsequery.network.CollaborationEventType.UNKNOWN,
            io.healthplatform.pulsequery.network.CollaborationEventType.fromWire("PING")
        )

        assertEquals(SolverOutcomeStatus.OPTIMAL, SolverOutcomeStatus.fromWire("OPTIMAL"))
        assertEquals(SolverOutcomeStatus.FEASIBLE, SolverOutcomeStatus.fromWire("feasible"))
        assertEquals(SolverOutcomeStatus.INFEASIBLE, SolverOutcomeStatus.fromWire("infeasible"))
        assertEquals(SolverOutcomeStatus.OPTIMAL, SolverOutcomeStatus.fromWire("unknown"))

        assertEquals(1, SurveyScore.clamped(0).value)
        assertEquals(5, SurveyScore.clamped(9).value)
        assertEquals("sess-1", OptimizationSessionId("sess-1").value)
        assertEquals("stanford_childrens", InstitutionId("stanford_childrens").value)
        assertEquals("patient_days_by_unit", QuickActionId("patient_days_by_unit").value)

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

        val procSql = ProcessorId.SQL_NO_MODEL
        assertEquals("SQL", procSql.value)
        assertEquals(procSql, Json.decodeFromString<ProcessorId>(Json.encodeToString(procSql)))

        assertEquals(ProcessorCategory.SQL, ProcessorCategory.fromWire("sql"))
        assertEquals(ProcessorCategory.OLLAMA, ProcessorCategory.fromWire("OLLAMA"))
        assertEquals(ProcessorCategory.ANY_LLM, ProcessorCategory.fromWire("any_llm"))
        assertEquals(ProcessorCategory.ANY_LLM, ProcessorCategory.fromWire("other"))

        val defaultOpt = ProcessorSelectionOption.SQL_DEFAULT
        val ollamaOpt = defaultOpt.copy(
            id = ProcessorId("ollama:llama3"),
            displayName = "Llama 3",
            provider = "ollama",
            category = ProcessorCategory.OLLAMA,
            isLocal = true
        )
        assertEquals("SQL [no model]", defaultOpt.displayName)
        assertEquals("sql", defaultOpt.provider)
        assertEquals(ProcessorCategory.SQL, defaultOpt.category)
        assertEquals(true, defaultOpt.isLocal)
        assertNotEquals(defaultOpt, ollamaOpt)
        assertEquals(
            ollamaOpt,
            Json.decodeFromString<ProcessorSelectionOption>(Json.encodeToString(ollamaOpt))
        )
    }

    /**
     * Verifies [parseTypedWidgetConfig], [extractWidgetSqlConfig], and [readJsonConfigString] across SQL, HTTP, and TEXT configs.
     */
    @Test
    fun testParseTypedWidgetConfigAndExtractWidgetSqlConfig() {
        val sqlObj = buildJsonObject {
            put("query", JsonPrimitive("SELECT 1"))
            put("allow_natural_text", JsonPrimitive(true))
            put("processor", JsonPrimitive("ollama:llama3"))
            put("natural_text_prompt", JsonPrimitive("Show census"))
            put("xKey", JsonPrimitive("unit"))
            put("yKey", JsonPrimitive("cnt"))
            put("non_prim", JsonArray(emptyList()))
        }
        assertNull(readJsonConfigString(sqlObj, "missing"))
        assertNull(readJsonConfigString(sqlObj, "non_prim"))

        val parsedSql = parseTypedWidgetConfig("SQL", sqlObj)
        assertTrue(parsedSql is TypedWidgetConfig.Sql)
        assertEquals("SELECT 1", parsedSql.query)
        assertTrue(parsedSql.allowNaturalText)
        assertEquals(ProcessorId("ollama:llama3"), parsedSql.processor)
        assertEquals("Show census", parsedSql.naturalTextPrompt)
        assertEquals("unit", parsedSql.xKey)
        assertEquals("cnt", parsedSql.yKey)

        val emptySql = extractWidgetSqlConfig(JsonObject(mapOf("processor" to JsonPrimitive("   "))))
        assertEquals(ProcessorId.SQL_NO_MODEL, emptySql.processor)
        assertEquals(false, emptySql.allowNaturalText)
        assertEquals("", emptySql.query)
        assertEquals(TypedWidgetConfig.Sql(query = "SELECT 2"), TypedWidgetConfig.Sql(query = "SELECT 2"))

        val httpObj = buildJsonObject {
            put("url", JsonPrimitive("https://api.example.com"))
            put("method", JsonPrimitive("POST"))
        }
        val parsedHttp = parseTypedWidgetConfig("HTTP", httpObj)
        assertEquals(TypedWidgetConfig.Http(url = "https://api.example.com", method = "POST"), parsedHttp)
        assertEquals(TypedWidgetConfig.Http(url = ""), parseTypedWidgetConfig("HTTP", JsonObject(emptyMap())))

        val textObjContent = buildJsonObject { put("content", JsonPrimitive("# Title")) }
        assertEquals(TypedWidgetConfig.Text(content = "# Title"), parseTypedWidgetConfig("TEXT", textObjContent))

        val textObjFallback = buildJsonObject { put("text", JsonPrimitive("Fallback note")) }
        assertEquals(TypedWidgetConfig.Text(content = "Fallback note"), parseTypedWidgetConfig("TEXT", textObjFallback))
        assertEquals(TypedWidgetConfig.Text(content = ""), parseTypedWidgetConfig("TEXT", JsonObject(emptyMap())))
    }

    /**
     * Verifies round-trip JSON serialization, non-throwing unknown wire fallback, and ViewModel value-class state transitions.
     */
    @Test
    fun testCompanionSerializersErrorsAndViewModelIntegration() {
        assertEquals(ClinicalRole.PHYSICIAN, Json.decodeFromString<ClinicalRole>(Json.encodeToString(ClinicalRole.PHYSICIAN)))
        assertEquals(ClinicalRole.ANALYST, Json.decodeFromString<ClinicalRole>("\"INVALID_ROLE\""))

        assertEquals(MessageAuthorRole.ASSISTANT, Json.decodeFromString<MessageAuthorRole>(Json.encodeToString(MessageAuthorRole.ASSISTANT)))
        assertEquals(MessageAuthorRole.USER, Json.decodeFromString<MessageAuthorRole>("\"UNKNOWN_AUTHOR\""))

        assertEquals(WidgetSourceType.HTTP, Json.decodeFromString<WidgetSourceType>(Json.encodeToString(WidgetSourceType.HTTP)))
        assertEquals(WidgetSourceType.SQL, Json.decodeFromString<WidgetSourceType>("\"UNKNOWN_SOURCE\""))

        assertEquals(VisualizationType.HEATMAP, Json.decodeFromString<VisualizationType>(Json.encodeToString(VisualizationType.HEATMAP)))
        assertEquals(VisualizationType.TABLE, Json.decodeFromString<VisualizationType>("\"UNKNOWN_VIZ\""))

        assertEquals(WidgetHttpMethod.POST, Json.decodeFromString<WidgetHttpMethod>(Json.encodeToString(WidgetHttpMethod.POST)))
        assertEquals(WidgetHttpMethod.GET, Json.decodeFromString<WidgetHttpMethod>("\"DELETE\""))

        assertEquals(OptimizationSessionId("s-1"), Json.decodeFromString<OptimizationSessionId>(Json.encodeToString(OptimizationSessionId("s-1"))))
        assertEquals(InstitutionId("chop"), Json.decodeFromString<InstitutionId>(Json.encodeToString(InstitutionId("chop"))))
        assertEquals(QuickActionId("qa-1"), Json.decodeFromString<QuickActionId>(Json.encodeToString(QuickActionId("qa-1"))))
        assertEquals(SurveyScore(5), Json.decodeFromString<SurveyScore>(Json.encodeToString(SurveyScore(5))))

        assertEquals(
            OptimizationUseCaseType.SURGICAL_SCHEDULING,
            Json.decodeFromString<OptimizationUseCaseType>(Json.encodeToString(OptimizationUseCaseType.SURGICAL_SCHEDULING))
        )
        assertEquals(OptimizationUseCaseType.SERVICE_UNIT, Json.decodeFromString<OptimizationUseCaseType>("\"UNKNOWN_UC\""))

        assertEquals(
            SolverOutcomeStatus.FEASIBLE,
            Json.decodeFromString<SolverOutcomeStatus>(Json.encodeToString(SolverOutcomeStatus.FEASIBLE))
        )
        assertEquals(SolverOutcomeStatus.OPTIMAL, Json.decodeFromString<SolverOutcomeStatus>("\"UNKNOWN_STATUS\""))

        assertEquals(
            ConstraintRuleType.MIN_CAPACITY,
            Json.decodeFromString<ConstraintRuleType>(Json.encodeToString(ConstraintRuleType.MIN_CAPACITY))
        )
        assertEquals(ConstraintRuleType.FORCE_FLOW, Json.decodeFromString<ConstraintRuleType>("\"UNKNOWN_RULE\""))

        val textCell: SqlCellValue = SqlCellValue.TextCell("A")
        val numCell: SqlCellValue = SqlCellValue.NumberCell(1.5)
        val boolCell: SqlCellValue = SqlCellValue.BooleanCell(true)
        val nullCell: SqlCellValue = SqlCellValue.NullCell
        assertEquals(textCell, Json.decodeFromString<SqlCellValue>(Json.encodeToString(textCell)))
        assertEquals(numCell, Json.decodeFromString<SqlCellValue>(Json.encodeToString(numCell)))
        assertEquals(boolCell, Json.decodeFromString<SqlCellValue>(Json.encodeToString(boolCell)))
        assertEquals(nullCell, Json.decodeFromString<SqlCellValue>(Json.encodeToString(nullCell)))
        assertEquals(
            SqlCellValue.TextCell("B"),
            Json.decodeFromString(SqlCellValue.TextCell.serializer(), Json.encodeToString(SqlCellValue.TextCell.serializer(), SqlCellValue.TextCell("B")))
        )
        assertEquals(
            SqlCellValue.NumberCell(2.5),
            Json.decodeFromString(SqlCellValue.NumberCell.serializer(), Json.encodeToString(SqlCellValue.NumberCell.serializer(), SqlCellValue.NumberCell(2.5)))
        )
        assertEquals(
            SqlCellValue.BooleanCell(false),
            Json.decodeFromString(SqlCellValue.BooleanCell.serializer(), Json.encodeToString(SqlCellValue.BooleanCell.serializer(), SqlCellValue.BooleanCell(false)))
        )
        assertEquals(
            SqlCellValue.NullCell,
            Json.decodeFromString(SqlCellValue.NullCell.serializer(), Json.encodeToString(SqlCellValue.NullCell.serializer(), SqlCellValue.NullCell))
        )

        val chartPt = ChartDataPoint("NICU", 12f)
        assertEquals(chartPt, Json.decodeFromString<ChartDataPoint>(Json.encodeToString(chartPt)))

        assertEquals(
            ProcessorCategory.OLLAMA,
            Json.decodeFromString<ProcessorCategory>(Json.encodeToString(ProcessorCategory.OLLAMA))
        )
        assertEquals(ProcessorCategory.ANY_LLM, Json.decodeFromString<ProcessorCategory>("\"UNKNOWN_CAT\""))

        val sseType = io.healthplatform.pulsequery.network.SseEventType.TOKEN
        assertEquals(sseType, Json.decodeFromString<io.healthplatform.pulsequery.network.SseEventType>(Json.encodeToString(sseType)))
        assertEquals(
            io.healthplatform.pulsequery.network.SseEventType.UNKNOWN,
            Json.decodeFromString<io.healthplatform.pulsequery.network.SseEventType>("\"heartbeat\"")
        )
        val ssePacket = io.healthplatform.pulsequery.network.SsePacket(event = "token", token = "hi")
        assertEquals(ssePacket, Json.decodeFromString<io.healthplatform.pulsequery.network.SsePacket>(Json.encodeToString(ssePacket)))

        val collabType = io.healthplatform.pulsequery.network.CollaborationEventType.WIDGET_UPDATED
        assertEquals(
            collabType,
            Json.decodeFromString<io.healthplatform.pulsequery.network.CollaborationEventType>(Json.encodeToString(collabType))
        )
        assertEquals(
            io.healthplatform.pulsequery.network.CollaborationEventType.UNKNOWN,
            Json.decodeFromString<io.healthplatform.pulsequery.network.CollaborationEventType>("\"PING\"")
        )
        val presence = io.healthplatform.pulsequery.network.CollaboratorPresence(userId = "u1", email = "a@b.c", role = "ADMIN", connectedAt = "t0")
        assertEquals(presence, Json.decodeFromString<io.healthplatform.pulsequery.network.CollaboratorPresence>(Json.encodeToString(presence)))
        val collabEvt = io.healthplatform.pulsequery.network.CollaborationEvent(type = "USER_JOINED", user = presence)
        assertEquals(collabEvt, Json.decodeFromString<io.healthplatform.pulsequery.network.CollaborationEvent>(Json.encodeToString(collabEvt)))

        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val mockWsRepo = io.healthplatform.pulsequery.network.DashboardWebSocketRepository(
            httpClient = io.healthplatform.pulsequery.createMockClient(),
            coroutineScope = scope
        )
        val dashVm = io.healthplatform.pulsequery.ui.screens.dashboard.DashboardViewModel(
            scope = scope,
            dashboardsApi = io.healthplatform.pulsequery.api.apis.DashboardsApi(
                baseUrl = "http://localhost:8000",
                httpClientEngine = io.healthplatform.pulsequery.mockEngine
            ),
            executionApi = io.healthplatform.pulsequery.api.apis.ExecutionApi(
                baseUrl = "http://localhost:8000",
                httpClientEngine = io.healthplatform.pulsequery.mockEngine
            ),
            webSocketRepository = mockWsRepo
        )
        dashVm.deleteDashboard(DashboardId("1"))
        dashVm.executeWidgetNaturalText(WidgetId("w1"), "SELECT 1")
        dashVm.executeWidgetNaturalText(WidgetId("w1"), "SELECT 1", ProcessorId.SQL_NO_MODEL)
        assertTrue(dashVm.state.value.dashboards.none { it.id == "1" })
        assertTrue(io.healthplatform.pulsequery.api.infrastructure.ApiClient.UNSAFE_HEADERS.isNotEmpty())

        val optVm = io.healthplatform.pulsequery.ui.screens.optimization.OptimizationViewModel(
            scope = scope,
            optimizationApi = io.healthplatform.pulsequery.api.apis.OptimizationApi(
                baseUrl = "http://localhost:8000",
                httpClientEngine = io.healthplatform.pulsequery.mockEngine
            )
        )
        optVm.selectInstitution(InstitutionId("chop"))
        assertEquals(InstitutionId("chop"), optVm.state.value.selectedInstitutionId)
    }
}
