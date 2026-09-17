package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.di.AppContainer
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
import kotlin.test.BeforeTest
import kotlin.test.Test

/**
 * Compose UI tests verifying [SimulationScreen] constraint configuration,
 * affinity override management, and before-after bed occupancy comparison table rendering.
 */
class SimulationScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    private val sampleSimulationResult = """
        {
          "status": "SUCCESS",
          "message": "Optimization converged successfully",
          "assignments": [
            {
              "Service": "General Medicine",
              "Unit": "WARD_A",
              "Patient_Count": 25.0,
              "Original_Count": 20.0,
              "Delta": 5.0
            },
            {
              "Service": "General Surgery",
              "Unit": "SURG_WARD",
              "Patient_Count": 12.0,
              "Original_Count": 15.0,
              "Delta": -3.0
            }
          ]
        }
    """.trimIndent()

    private val sampleSchema = """
        [
          {
            "table_name": "synthetic_hospital_data",
            "columns": [
              { "name": "PiCSN", "type": "VARCHAR" },
              { "name": "Location", "type": "VARCHAR" }
            ]
          }
        ]
    """.trimIndent()

    private val sampleHealth = """
        {
          "overall_status": "healthy",
          "timestamp": "2026-09-14T12:00:00Z",
          "postgres": { "status": "connected" },
          "duckdb": { "status": "ready", "total_tables": 1, "tables": {} },
          "data": { "has_default_data": true, "fallback_generated": false, "missing_files": [], "row_counts": {} },
          "templates": { "templates_loaded": 1, "has_templates": true, "missing_file": false },
          "llm": { "providers_count": 1, "mock_mode": false, "models": [] },
          "warnings": []
        }
    """.trimIndent()

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("system/health") -> {
                    respond(sampleHealth, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
                }
                request.url.encodedPath.contains("schema") -> {
                    respond(sampleSchema, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
                }
                request.url.encodedPath.contains("simulation/run") -> {
                    respond(sampleSimulationResult, HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testSimulationScreenInitial() = runComposeUiTest {
        setContent {
            MaterialTheme {
                SimulationScreen()
            }
        }

        onNodeWithText("Capacity Simulation").assertExists()
        onNodeWithText("Demand SQL").assertExists()
        onNodeWithText("ICU Capacity").assertExists()
        onNode(hasText("WARD Capacity", ignoreCase = true)).assertExists()
        onNodeWithText("Custom Constraints").assertExists()
        onNodeWithText("Affinity Overrides").assertExists()
        onNodeWithContentDescription("Run Simulation").assertExists().assertHasClickAction()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAddConstraintAndAffinityFlow() = runComposeUiTest {
        setContent {
            MaterialTheme {
                SimulationScreen()
            }
        }

        // 1. Click Add Constraint
        onNodeWithText("Add Constraint").performClick()
        waitUntilAtLeastOneExists(hasText("Constraint Type"), timeoutMillis = 5000)
        onNodeWithText("Constraint Type").assertExists()

        // Confirm Add Constraint dialog
        onNodeWithContentDescription("Confirm Add Constraint").performClick()

        // Verify constraint row added
        waitUntilAtLeastOneExists(hasContentDescription("Delete constraint"), timeoutMillis = 5000)
        onNodeWithContentDescription("Delete constraint").assertExists()

        // 2. Scroll to and click Add Affinity
        onNode(hasScrollAction()).performScrollToNode(hasText("Affinity Overrides"))
        onNodeWithText("Add Affinity").performClick()
        waitUntilAtLeastOneExists(hasText("Affinity Score"), timeoutMillis = 5000)
        onNodeWithText("Affinity Score").assertExists()

        // Confirm Add Affinity dialog
        onNodeWithContentDescription("Confirm Add Affinity").performClick()

        // Verify affinity row added
        waitUntilAtLeastOneExists(hasContentDescription("Delete affinity"), timeoutMillis = 5000)
        onNode(hasScrollAction()).performScrollToNode(hasContentDescription("Delete affinity"))
        onNodeWithContentDescription("Delete affinity").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testRunSimulationAndComparisonTableRendering() = runComposeUiTest {
        setContent {
            MaterialTheme {
                SimulationScreen(customScope = CoroutineScope(Dispatchers.Unconfined))
            }
        }

        // Click Run Simulation FAB
        onNodeWithContentDescription("Run Simulation").performClick()
        waitForIdle()

        // Scroll to results
        onNode(hasScrollAction()).performScrollToNode(hasText("Before & After Bed Occupancy"))
        onNodeWithText("Before & After Bed Occupancy").assertExists()
        onNodeWithContentDescription("Bed occupancy comparison table").assertExists()

        // Check rows and deltas
        onNode(hasScrollAction()).performScrollToNode(hasText("General Medicine"))
        onNodeWithText("General Medicine").assertExists()
        onNodeWithText("WARD_A").assertExists()
        onNodeWithText("+5").assertExists() // Positive delta

        onNode(hasScrollAction()).performScrollToNode(hasText("General Surgery"))
        onNodeWithText("General Surgery").assertExists()
        onNodeWithText("SURG_WARD").assertExists()
        onNodeWithText("-3").assertExists() // Negative delta
    }
}
