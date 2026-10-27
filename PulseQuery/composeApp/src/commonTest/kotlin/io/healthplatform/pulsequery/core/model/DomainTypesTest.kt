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

        assertEquals(MpaxArenaEvaluationMode.CRITIC, MpaxArenaEvaluationMode.fromWire("critic"))
        assertEquals(MpaxArenaEvaluationMode.TRANSLATOR, MpaxArenaEvaluationMode.fromWire("translator"))
        assertEquals(MpaxArenaEvaluationMode.CONSTRAINTS, MpaxArenaEvaluationMode.fromWire("constraints"))
        assertEquals(MpaxArenaEvaluationMode.JUDGE, MpaxArenaEvaluationMode.fromWire("judge"))
        assertEquals(MpaxArenaEvaluationMode.SQL_VS_MPAX, MpaxArenaEvaluationMode.fromWire("sql_vs_mpax"))
        assertEquals(MpaxArenaEvaluationMode.SQL_VS_MPAX, MpaxArenaEvaluationMode.fromWire("other"))

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
     * Verifies companion object serializers, serialization failure cases, and ViewModel value-class integration.
     */
    @Test
    fun testCompanionSerializersErrorsAndViewModelIntegration() {
        assertTrue(DashboardId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(WidgetId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ConversationId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(MessageId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(CandidateId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(UserId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(AlertRuleId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ColumnName.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ClinicalRole.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(MessageAuthorRole.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(WidgetSourceType.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(VisualizationType.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(WidgetHttpMethod.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(MpaxArenaEvaluationMode.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(SimulationOutcomeStatus.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ConstraintRuleType.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(SqlCellValue.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(SqlCellValue.TextCell.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(SqlCellValue.NumberCell.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(SqlCellValue.BooleanCell.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(SqlCellValue.NullCell.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ChartDataPoint.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ProcessorId.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ProcessorCategory.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(ProcessorSelectionOption.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(io.healthplatform.pulsequery.network.SsePacket.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(io.healthplatform.pulsequery.network.SseEventType.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(io.healthplatform.pulsequery.network.CollaborationEvent.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(io.healthplatform.pulsequery.network.CollaborationEventType.serializer().descriptor.serialName.isNotEmpty())
        assertTrue(io.healthplatform.pulsequery.network.CollaboratorPresence.serializer().descriptor.serialName.isNotEmpty())

        var threwSerializationError = false
        try {
            Json.decodeFromString<ClinicalRole>("\"INVALID_ROLE\"")
        } catch (_: kotlinx.serialization.SerializationException) {
            threwSerializationError = true
        }
        assertTrue(threwSerializationError)

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
        assertTrue(io.healthplatform.pulsequery.api.infrastructure.ApiClient.UNSAFE_HEADERS.isNotEmpty())

        val mpaxVm = io.healthplatform.pulsequery.ui.screens.mpax.MpaxArenaViewModel(
            scope = scope,
            mpaxArenaApi = io.healthplatform.pulsequery.api.apis.MpaxArenaApi(
                baseUrl = "http://localhost:8000",
                httpClientEngine = io.healthplatform.pulsequery.mockEngine
            )
        )
        mpaxVm.voteCandidate(CandidateId("c1"))
    }
}
