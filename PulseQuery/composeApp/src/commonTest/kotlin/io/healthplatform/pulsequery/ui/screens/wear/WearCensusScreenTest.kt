/**
 * Unit tests verifying Wearable Form Factor census and alert tile layouts.
 */
package io.healthplatform.pulsequery.ui.screens.wear

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.testing.BaseComposeTest
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Validates rendering and semantic content of the Wear OS Census screen and alert cards.
 */
@OptIn(ExperimentalTestApi::class)
class WearCensusScreenTest : BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @Test
    fun testBuildWearAlertAccessibilityDescription() {
        assertEquals("Alert: Pediatric ICU", buildWearAlertAccessibilityDescription("Pediatric ICU"))
        kotlin.test.assertFalse(hasActiveWearAlerts(emptyList()))
        assertTrue(
            hasActiveWearAlerts(
                listOf(
                    AlertRuleResponse(
                        id = "a-1",
                        unitCategory = "ICU",
                        thresholdPercentage = 90.0,
                        createdAt = kotlin.time.Instant.fromEpochMilliseconds(1750000000000L)
                    )
                )
            )
        )
    }

    @Test
    fun testWearCensusScreenRendersGlanceableKPIsAndAlerts() = runComposeUiTest {
        val mockEngine = createUnconfinedMockEngine { request ->
            if (request.url.encodedPath.contains("/analytics/alert-rules")) {
                respond(
                    content = """[{"id":"r-1","unit_category":"Pediatric ICU","threshold_percentage":90.0,"severity":"CRITICAL","is_active":true,"created_at":"2026-09-01T00:00:00Z"}]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else {
                respond("[]", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)

        setContent {
            WearCensusScreen()
        }

        onNodeWithText("Pulse Watch").assertExists()
        onNodeWithText("HOSPITAL CENSUS").assertExists()
        onNodeWithText("88%").assertExists()
        onNodeWithText("42 Beds Open").assertExists()

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Pediatric ICU", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Pediatric ICU").assertExists()
        onNodeWithContentDescription("Refresh Wear Data").performClick()
    }

    @Test
    fun testWearAlertCardAndExitCallback() = runComposeUiTest {
        var exitCalled = false
        val sampleAlert = AlertRuleResponse(
            id = "a-1",
            unitCategory = "NICU",
            thresholdPercentage = 95.0,
            severity = AlertSeverity.CRITICAL,
            isActive = true,
            createdAt = kotlin.time.Instant.fromEpochMilliseconds(1750000000000L)
        )
        setContent {
            WearAlertCard(alert = sampleAlert)
            WearCensusScreen(onExit = { exitCalled = true })
        }

        onNodeWithText("NICU").assertExists()
        onNodeWithText("Exit").performClick()
        assertTrue(exitCalled)
    }
}
