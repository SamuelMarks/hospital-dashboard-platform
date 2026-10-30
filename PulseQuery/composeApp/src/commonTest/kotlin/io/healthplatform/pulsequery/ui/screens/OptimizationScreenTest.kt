/**
 * Compose UI tests for [OptimizationScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.models.DesEvaluationSummary
import io.healthplatform.pulsequery.api.models.ExpertBaselineMetricItem
import io.healthplatform.pulsequery.api.models.OptimizationSolutionPayload
import io.healthplatform.pulsequery.api.models.QuickActionExecutionResponse
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ml.LiteRtRuntimeState
import io.healthplatform.pulsequery.testing.BaseComposeTest
import io.healthplatform.pulsequery.ui.screens.optimization.OptimizationUiState
import io.healthplatform.pulsequery.ui.screens.optimization.OptimizationViewModel
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
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

/**
 * Verifies [OptimizationScreen] rendering, Use Case switching, Quick Actions,
 * LiteRT hot-loading controls, DES metrics display, and survey submission.
 */
class OptimizationScreenTest : BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
        val mockEngine = MockEngine {
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
}
