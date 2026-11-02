/**
 * Compose UI tests for [OptimizationScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.models.DataHealthSchema
import io.healthplatform.pulsequery.api.models.DesEvaluationSummary
import io.healthplatform.pulsequery.api.models.DuckDbHealthSchema
import io.healthplatform.pulsequery.api.models.ExpertBaselineMetricItem
import io.healthplatform.pulsequery.api.models.LlmHealthSchema
import io.healthplatform.pulsequery.api.models.OptimizationSolutionPayload
import io.healthplatform.pulsequery.api.models.PostgresHealthSchema
import io.healthplatform.pulsequery.api.models.QuickActionExecutionResponse
import io.healthplatform.pulsequery.api.models.SystemHealthResponse
import io.healthplatform.pulsequery.api.models.TemplateHealthSchema
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ml.LiteRtRuntimeState
import io.healthplatform.pulsequery.testing.BaseComposeTest
import io.healthplatform.pulsequery.ui.screens.optimization.OptimizationUiState
import io.healthplatform.pulsequery.ui.screens.optimization.OptimizationViewModel
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Verifies [OptimizationScreen] rendering, Use Case switching, Quick Actions,
 * LiteRT hot-loading controls, DES metrics display, and survey submission.
 */
class OptimizationScreenTest : BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
        val mockEngine = createUnconfinedMockEngine {
            respond(
                content = "[]",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        AppContainer.setHttpClientForTest(
            HttpClient(mockEngine) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }
        )
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testOptimizationScreenRendersAndHandlesInteractions() = runComposeUiTest {
        val sampleSolution = OptimizationSolutionPayload(
            useCase = OptimizationSolutionPayload.UseCase.service_unit,
            objectiveValue = 100.0,
            solveTimeMs = 3.2,
            desEvaluation = DesEvaluationSummary(
                useCase = DesEvaluationSummary.UseCase.service_unit,
                overallExpertGapPct = 1.2,
                metrics = listOf(
                    ExpertBaselineMetricItem(
                        metricKey = "off_service_patient_days",
                        label = "Off-Service Patient Days",
                        unitLabel = "patient-days",
                        manualHistoricalValue = 400.0,
                        expertBaselineValue = 95.0,
                        llmMpaxValue = 102.0,
                        improvementVsManualPct = 74.5,
                        expertAttainmentPct = 97.7
                    )
                )
            )
        )
        val sampleReport = QuickActionExecutionResponse(
            actionId = QuickActionExecutionResponse.ActionId.patient_days_by_unit,
            title = "Patient Days by Hospital Unit",
            summaryMarkdown = "Analyzed 6 units",
            columns = listOf("Unit"),
            rows = emptyList()
        )

        val vm = OptimizationViewModel(
            scope = CoroutineScope(Dispatchers.Unconfined),
            initialState = OptimizationUiState(
                latestSolution = sampleSolution,
                quickActionReport = sampleReport,
                activeLiteRtModel = LiteRtRuntimeState.DEFAULT_LITERT_MODELS.first(),
                errorMessage = "Sample warning",
                surveySubmitted = true
            )
        )

        setContent {
            MaterialTheme {
                OptimizationScreen(viewModel = vm)
            }
        }

        onNodeWithTag("optimization-title").assertIsDisplayed()
        onNodeWithTag("chip-uc-surgical").performClick()
        onNodeWithTag("chip-uc-staffing").performClick()
        onNodeWithTag("chip-uc-service-unit").performClick()
        onNodeWithTag("btn-litert-hot-load").performClick()
        onNodeWithTag("badge-litert-active").assertIsDisplayed()
        onNodeWithTag("qa-patient_days_by_unit").performClick()
        onNodeWithTag("input-optimization-prompt").performTextReplacement("Open 8 beds on PCU 360")
        onNodeWithTag("btn-submit-optimization").performClick()
        onNodeWithTag("btn-submit-survey").performClick()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testOptimizationScreenDefaultViewModelAndLoadingState() = runComposeUiTest {
        val loadingVm = OptimizationViewModel(
            scope = CoroutineScope(Dispatchers.Unconfined),
            initialState = OptimizationUiState(isLoading = true)
        )
        setContent {
            MaterialTheme {
                OptimizationScreen(initialPrompt = "Custom prompt", viewModel = loadingVm)
            }
        }
        onNodeWithTag("optimization-screen").performScrollToNode(hasTestTag("optimization-loading"))
        onNodeWithTag("optimization-loading").assertIsDisplayed()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testOptimizationScreenAutoInitAndUnhealthyDatabaseRetry() = runComposeUiTest {
        val mockEngine = createUnconfinedMockEngine { request ->
            if (request.url.encodedPath.contains("health")) {
                respond(
                    content = """{"overall_status":"degraded","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"error","error":"PG Down"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":false,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":0,"has_templates":false,"missing_file":false},"llm":{"providers_count":0,"mock_mode":false,"models":[]},"warnings":[]}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else {
                respond(
                    content = "[]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        AppContainer.setHttpClientForTest(
            HttpClient(mockEngine) {
                install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
            }
        )
        kotlinx.coroutines.runBlocking {
            AppContainer.networkHealthRepository.checkHealth()
        }

        setContent {
            MaterialTheme {
                OptimizationScreen(initialPrompt = null, viewModel = null)
            }
        }

        waitForIdle()
        onNodeWithText("Retry Query").performClick()
    }

    @Test
    fun testOptimizationScreenPureHelpers() {
        val scope = CoroutineScope(Dispatchers.Unconfined)
        val existingVm = OptimizationViewModel(scope = scope)
        assertSame(existingVm, resolveOptimizationViewModel(existingVm, "Ignored", scope))

        val promptVm = resolveOptimizationViewModel(null, "Open 4 beds", scope)
        assertEquals("Open 4 beds", promptVm.state.value.prompt)

        val blankVm = resolveOptimizationViewModel(null, "   ", scope)
        assertEquals(OptimizationUiState().prompt, blankVm.state.value.prompt)

        val nullPromptVm = resolveOptimizationViewModel(null, null, scope)
        assertEquals(OptimizationUiState().prompt, nullPromptVm.state.value.prompt)

        assertTrue(shouldInitializeOptimizationWorkspace(OptimizationUiState(latestSolution = null, isLoading = false)))
        assertFalse(shouldInitializeOptimizationWorkspace(OptimizationUiState(latestSolution = null, isLoading = true)))

        val sampleSolution = OptimizationSolutionPayload(
            useCase = OptimizationSolutionPayload.UseCase.service_unit,
            objectiveValue = 100.0,
            solveTimeMs = 3.2,
            desEvaluation = DesEvaluationSummary(
                useCase = DesEvaluationSummary.UseCase.service_unit,
                overallExpertGapPct = 1.2,
                metrics = listOf(
                    ExpertBaselineMetricItem(
                        metricKey = "k1",
                        label = "L1",
                        unitLabel = "u",
                        manualHistoricalValue = 1.0,
                        expertBaselineValue = 1.0,
                        llmMpaxValue = 1.0,
                        improvementVsManualPct = 0.0,
                        expertAttainmentPct = 100.0
                    )
                )
            )
        )
        assertFalse(shouldInitializeOptimizationWorkspace(OptimizationUiState(latestSolution = sampleSolution, isLoading = false)))
        assertTrue(extractDesMetrics(OptimizationUiState(latestSolution = null)).isEmpty())
        assertEquals(1, extractDesMetrics(OptimizationUiState(latestSolution = sampleSolution)).size)

        assertEquals("Default DB Error", resolveOptimizationDatabaseErrorMessage(null, "Default DB Error"))
        val duckErrHealth = SystemHealthResponse(
            overallStatus = "degraded",
            timestamp = "2026-09-14T12:00:00Z",
            postgres = PostgresHealthSchema(status = "connected", error = null),
            duckdb = DuckDbHealthSchema(status = "error", path = "mem", error = "DuckDB Locked"),
            data = DataHealthSchema(hasDefaultData = false, fallbackGenerated = false),
            templates = TemplateHealthSchema(templatesLoaded = 0, hasTemplates = false, missingFile = false),
            llm = LlmHealthSchema(providersCount = 0, mockMode = false)
        )
        assertEquals("DuckDB Locked", resolveOptimizationDatabaseErrorMessage(duckErrHealth, "Default DB Error"))

        val pgErrHealth = duckErrHealth.copy(
            duckdb = DuckDbHealthSchema(status = "ready", path = "mem", error = null),
            postgres = PostgresHealthSchema(status = "error", error = "PG Refused")
        )
        assertEquals("PG Refused", resolveOptimizationDatabaseErrorMessage(pgErrHealth, "Default DB Error"))

        val cleanHealth = pgErrHealth.copy(
            postgres = PostgresHealthSchema(status = "connected", error = null)
        )
        assertEquals("Default DB Error", resolveOptimizationDatabaseErrorMessage(cleanHealth, "Default DB Error"))

        retryOptimizationDatabaseAndInitialize(existingVm)
    }
}
