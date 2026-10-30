/**
 * Comprehensive unit tests for [OptimizationViewModel], [OptimizationUiState],
 * [LiteRtModelManager], [LiteRtModelDescriptor], and [LiteRtRuntimeState].
 */
package io.healthplatform.pulsequery.ui.screens.optimization

import io.healthplatform.pulsequery.api.apis.OptimizationApi
import io.healthplatform.pulsequery.core.model.InstitutionId
import io.healthplatform.pulsequery.core.model.OptimizationUseCaseType
import io.healthplatform.pulsequery.core.model.QuickActionId
import io.healthplatform.pulsequery.core.model.SurveyScore
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ml.LiteRtModelDescriptor
import io.healthplatform.pulsequery.ml.LiteRtModelManager
import io.healthplatform.pulsequery.ml.LiteRtRuntimeState
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val MOCK_SOLUTION_JSON = """
{
  "use_case": "service_unit",
  "institution_id": "stanford_childrens",
  "solver_status": "OPTIMAL",
  "objective_value": 100.0,
  "solve_time_ms": 3.5,
  "service_unit_assignments": [
    {
      "service": "General Pediatrics",
      "unit": "PCU 350",
      "is_home_unit": true,
      "baseline_patient_days": 400.0,
      "expert_baseline_patient_days": 460.0,
      "optimized_patient_days": 455.0,
      "allocated_beds": 18,
      "delta_patient_days": 55.0
    }
  ],
  "surgical_schedule_assignments": [],
  "staffing_assignments": [],
  "des_evaluation": {
    "use_case": "service_unit",
    "replications": 128,
    "horizon_days": 180,
    "overall_expert_gap_pct": 1.2,
    "metrics": [
      {
        "metric_key": "off_service_patient_days",
        "label": "Off-Service Patient Days",
        "unit_label": "patient-days",
        "lower_is_better": true,
        "manual_historical_value": 420.0,
        "expert_baseline_value": 95.0,
        "llm_mpax_value": 102.0,
        "improvement_vs_manual_pct": 75.7,
        "expert_attainment_pct": 97.8
      }
    ]
  }
}
"""

/**
 * Unit test suite verifying [OptimizationViewModel] and [LiteRtModelManager].
 */
class OptimizationViewModelTest {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    private fun createClient(engine: MockEngine): HttpClient = HttpClient(engine) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; isLenient = true })
        }
    }

    private fun createSuccessMockEngine(
        sessionHasSolution: Boolean = true,
        quickActionHasSolution: Boolean = true,
        sessionHasNullIterations: Boolean = false
    ): MockEngine = MockEngine { req ->
        val path = req.url.encodedPath
        val body = when {
            path.endsWith("/institutions") -> """
                [{"institution_id":"stanford_childrens","name":"Stanford Children's","short_name":"Stanford Children's","hospital_type":"pediatric","total_licensed_beds":156,"unit_capacities":{"PCU 350":28},"clinical_services":["General Pediatrics"],"home_unit_map":{"General Pediatrics":["PCU 350"]},"surgical_programs":["BEDS","POINTS"],"federated_node_enabled":true}]
            """.trimIndent()
            path.endsWith("/models") -> """
                [{"model_id":"gemini-2.5-pro","display_name":"Gemini 2.5 Pro","family":"gemini","deployment_target":"gcp_cloud","supports_differential_privacy":false,"supports_hot_loading":false}]
            """.trimIndent()
            path.contains("/quick-actions/") -> {
                val qaSol = if (quickActionHasSolution) MOCK_SOLUTION_JSON else "null"
                """
                {"action_id":"patient_days_by_unit","title":"Patient Days by Unit","summary_markdown":"Summary","columns":["Unit"],"rows":[{"Unit":"PCU 350"}],"optimization_solution":$qaSol}
                """.trimIndent()
            }
            path.endsWith("/quick-actions") -> """
                [{"action_id":"patient_days_by_unit","label":"Patient Days by Unit","icon":"📊","description":"Desc","use_case":"service_unit","default_prompt":"Prompt"}]
            """.trimIndent()
            path.endsWith("/solve") -> MOCK_SOLUTION_JSON
            path.endsWith("/iterate") -> """
                {"id":"it-2","session_id":"sess-1","turn_index":2,"user_prompt":"Open 10 beds","model_id":"gemini-2.5-pro","assistant_explanation":"Explanation","follow_up_suggestions":["S1"],"solution":$MOCK_SOLUTION_JSON,"latency_ms":10,"created_at":"2026-10-30T00:00:00Z"}
            """.trimIndent()
            path.endsWith("/sessions") -> {
                val solField = if (sessionHasSolution) MOCK_SOLUTION_JSON else "null"
                val iterField = if (sessionHasNullIterations) "null" else "[]"
                """
                {"id":"sess-1","user_id":"u-1","use_case":"service_unit","institution_id":"stanford_childrens","title":"Session 1","latest_solution":$solField,"iterations":$iterField,"created_at":"2026-10-30T00:00:00Z","updated_at":"2026-10-30T00:00:00Z"}
                """.trimIndent()
            }
            path.endsWith("/surveys") -> """
                {"id":"surv-1","user_id":"u-1","session_id":"sess-1","use_case":"service_unit","role_category":"Physician","score_vs_manual_process":5,"score_vs_other_workflow_tech":5,"interpretability_score":5,"qualitative_feedback":"Great","created_at":"2026-10-30T00:00:00Z"}
            """.trimIndent()
            else -> "{}"
        }
        respond(
            content = body,
            status = HttpStatusCode.OK,
            headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
        )
    }

    @Test
    fun testLiteRtModelManagerLifecycleAndValidation() {
        val manager = LiteRtModelManager()
        assertNull(manager.state.value.activeModel)
        assertEquals(0, manager.state.value.hotLoadCount)
        assertTrue(LiteRtRuntimeState.DEFAULT_LITERT_MODELS.isNotEmpty())

        assertFalse(manager.isValidSha256Hex("short"))
        assertFalse(manager.isValidSha256Hex("z".repeat(64)))
        assertTrue(manager.isValidSha256Hex("0123456789abcdefABCDEF" + "a".repeat(42)))

        // Hot-load valid default model
        val loadOk = manager.hotLoadModelResult("litert-medgemma-4b-int4")
        assertTrue(loadOk.isSuccess)
        assertEquals("litert-medgemma-4b-int4", manager.state.value.activeModel?.modelId)
        assertEquals(1, manager.state.value.hotLoadCount)

        // Hot-load unknown model
        val loadMissing = manager.hotLoadModelResult("nonexistent-model")
        assertTrue(loadMissing.isFailure)
        assertNotNull(manager.state.value.lastErrorMessage)

        // Register custom artifact (valid, activateImmediately = true and false)
        val validDigest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        val customDesc = LiteRtModelDescriptor(
            modelId = "custom-gemma-tpu-int4",
            displayName = "Custom TPU Gemma",
            quantization = "INT4",
            artifactFilename = "custom.litertlm",
            sha256Checksum = validDigest,
            targetPlatforms = listOf("android_arm64")
        )
        assertTrue(manager.registerCustomArtifactResult(customDesc, activateImmediately = false).isSuccess)
        assertTrue(manager.registerCustomArtifactResult(customDesc, activateImmediately = true).isSuccess)
        assertEquals("custom-gemma-tpu-int4", manager.state.value.activeModel?.modelId)

        // Register custom artifact with invalid SHA-256 and activateImmediately = true to hit hotLoadModelResult checksum failure
        val badChecksumDesc = customDesc.copy(modelId = "corrupt-sha-model", sha256Checksum = "invalid-sha")
        assertTrue(manager.registerCustomArtifactResult(badChecksumDesc, activateImmediately = true).isFailure)

        // Register custom artifact with blank modelId
        val blankIdDesc = customDesc.copy(modelId = "   ")
        assertTrue(manager.registerCustomArtifactResult(blankIdDesc, activateImmediately = false).isFailure)

        // Unload active model
        manager.unloadActiveModel()
        assertNull(manager.state.value.activeModel)
    }

    @Test
    fun testViewModelInitializationQuickActionsSessionAndSurveyFlows() = runTest {
        val client = createClient(createSuccessMockEngine(sessionHasSolution = true))
        AppContainer.setHttpClientForTest(client)

        val vm = OptimizationViewModel(scope = this)
        assertTrue(vm.performInitializeWorkspace().isSuccess)
        assertEquals(1, vm.state.value.institutions.size)
        assertNotNull(vm.state.value.latestSolution)

        // Switch across all 3 use cases, institution, model, and prompt
        for (uc in OptimizationUseCaseType.entries) {
            vm.selectUseCase(uc)
            assertEquals(uc, vm.state.value.selectedUseCase)
            assertTrue(vm.performInitializeWorkspace().isSuccess)
            assertTrue(vm.performExecuteQuickAction(QuickActionId("patient_days_by_unit")).isSuccess)
            assertTrue(
                vm.performSubmitSurvey(
                    SurveyScore(5),
                    SurveyScore(5),
                    SurveyScore(5),
                    "Fast"
                ).isSuccess
            )
        }

        vm.selectInstitution(InstitutionId("chop"))
        assertEquals("chop", vm.state.value.selectedInstitutionId.value)
        vm.selectModel("medgemma-27b-text-it")
        assertEquals("medgemma-27b-text-it", vm.state.value.selectedModelId)

        // Hot-load LiteRT model (success & failure)
        assertTrue(vm.hotLoadLiteRtModel("litert-medgemma-4b-int4").isSuccess)
        assertNotNull(vm.state.value.activeLiteRtModel)
        assertTrue(vm.hotLoadLiteRtModel("unknown-litert").isFailure)

        // Empty prompt validation failure
        vm.updatePrompt("   ")
        assertTrue(vm.performSubmitPrompt().isFailure)

        // Create session (first turn) and iterate session (second turn) across use cases
        for (uc in OptimizationUseCaseType.entries) {
            vm.selectUseCase(uc)
            vm.updatePrompt("Open 10 beds on PCU 360")
            assertTrue(vm.performSubmitPrompt().isSuccess)
            assertNotNull(vm.state.value.activeSession)

            // Second turn iterates the active session
            vm.updatePrompt("Reserve 6 beds for Cardiology")
            assertTrue(vm.performSubmitPrompt().isSuccess)
            assertEquals(1, vm.state.value.activeSession?.iterations?.size)
        }

        // Also test session creation when latestSolution in response is null (fallback solve),
        // quickActionHasSolution = false, sessionHasNullIterations = true, and explicit liteRtManager
        val fallbackApi = OptimizationApi(
            baseUrl = "http://localhost",
            httpClient = createClient(
                createSuccessMockEngine(
                    sessionHasSolution = false,
                    quickActionHasSolution = false,
                    sessionHasNullIterations = true
                )
            )
        )
        val vmFallback = OptimizationViewModel(
            scope = this,
            optimizationApi = fallbackApi,
            liteRtManager = LiteRtModelManager(),
            initialState = OptimizationUiState()
        )
        assertTrue(vmFallback.hotLoadLiteRtModel("litert-medgemma-4b-int4").isSuccess)
        assertTrue(vmFallback.performExecuteQuickAction(QuickActionId("patient_days_by_unit")).isSuccess)
        assertTrue(vmFallback.performSubmitPrompt().isSuccess)
        assertTrue(vmFallback.performSubmitPrompt().isSuccess)
        assertTrue(
            vmFallback.performSubmitSurvey(
                SurveyScore(5),
                SurveyScore(5),
                SurveyScore(5),
                "No active session"
            ).isSuccess
        )
    }

    @Test
    fun testViewModelFailureBranchesAndWrapperFunctions() = runTest {
        val failEngine = MockEngine {
            respond(
                content = """{"detail":"Optimization engine offline"}""",
                status = HttpStatusCode.InternalServerError,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val failApi = OptimizationApi(baseUrl = "http://localhost", httpClient = createClient(failEngine))
        val vm = OptimizationViewModel(scope = this, optimizationApi = failApi)

        assertTrue(vm.performInitializeWorkspace().isFailure)
        assertNotNull(vm.state.value.errorMessage)

        assertTrue(vm.performExecuteQuickAction(QuickActionId("patient_days_by_unit")).isFailure)
        assertNotNull(vm.state.value.errorMessage)

        assertTrue(vm.performSubmitPrompt().isFailure)
        assertNotNull(vm.state.value.errorMessage)

        assertTrue(vm.performSubmitSurvey(SurveyScore(5), SurveyScore(5), SurveyScore(5), "").isFailure)
        assertNotNull(vm.state.value.errorMessage)

        // Also exercise non-suspending launch wrappers
        val okClient = createClient(createSuccessMockEngine())
        AppContainer.setHttpClientForTest(okClient)
        val vmOk = OptimizationViewModel(scope = this)
        vmOk.initializeWorkspace()
        vmOk.executeQuickAction(QuickActionId("patient_days_by_unit"))
        vmOk.submitPrompt()
        vmOk.submitSurvey()
    }
}
