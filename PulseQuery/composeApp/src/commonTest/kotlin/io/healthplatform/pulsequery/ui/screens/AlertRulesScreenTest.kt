/**
 * Unit and Compose UI tests for [AlertRulesScreen] and [AlertRulesViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.apis.AlertRulesApi
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertRuleUpdate
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.core.model.ClinicalRole
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.alertrules.AlertRulesViewModel
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
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Validates the state, edit dialog payloads, production [AlertRulesViewModel] validation,
 * and Compose UI rendering of [AlertRulesScreen].
 */
class AlertRulesScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    /**
     * Resets [AppContainer] before each test.
     */
    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun createAlertRulesClient(): HttpClient {
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("/api/v1/analytics/alert-rules") -> respond(
                    content = """[{
                        "id": "rule-uuid-1234",
                        "unit_category": "Pediatric ICU",
                        "threshold_percentage": 90.0,
                        "severity": "CRITICAL",
                        "is_active": true,
                        "created_at": "2026-09-01T00:00:00Z"
                    }]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        return HttpClient(engine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
    }

    /**
     * Verifies that [AlertRulesScreen] renders configured alert rules from the API.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAlertRulesScreenRendersRules() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createAlertRulesClient())

        setContent {
            MaterialTheme {
                AlertRulesScreen()
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Pediatric ICU").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Pediatric ICU").assertIsDisplayed()
    }

    /**
     * Verifies that an [AlertRuleUpdate] payload correctly maps modified attributes.
     */
    @Test
    fun testAlertRuleUpdatePayloadConstruction() {
        val updatePayload = AlertRuleUpdate(
            unitCategory = "Cardiology ICU",
            thresholdPercentage = 92.5,
            severity = AlertSeverity.CRITICAL,
            isActive = true
        )

        assertEquals("Cardiology ICU", updatePayload.unitCategory)
        assertEquals(92.5, updatePayload.thresholdPercentage)
        assertEquals(AlertSeverity.CRITICAL, updatePayload.severity)
        assertTrue(updatePayload.isActive ?: false)
    }

    /**
     * Verifies that [AlertRuleUpdate] allows partial attributes with null defaults.
     */
    @Test
    fun testAlertRuleUpdatePartialAttributes() {
        val partialPayload = AlertRuleUpdate(
            thresholdPercentage = 80.0
        )

        assertNull(partialPayload.unitCategory)
        assertEquals(80.0, partialPayload.thresholdPercentage)
        assertNull(partialPayload.severity)
        assertNull(partialPayload.isActive)
    }

    /**
     * Verifies production [AlertRulesViewModel] validation bounds for occupancy thresholds and unit categories.
     */
    @Test
    fun testAlertRulesViewModelValidationAndRoleChecks() = runTest {
        val client = createAlertRulesClient()
        val api = AlertRulesApi(baseUrl = "http://localhost", httpClient = client)
        val vm = AlertRulesViewModel(scope = this, alertRulesApi = api)

        assertTrue(vm.canModifyRules(ClinicalRole.ADMIN))
        assertTrue(vm.canModifyRules(ClinicalRole.PHYSICIAN))
        assertFalse(vm.canModifyRules(ClinicalRole.CHARGE_NURSE))

        // Blank unit category validation in production createRule & updateRule
        vm.createRule(unitCategory = "   ", thresholdText = "85")
        assertEquals("Unit category is required", vm.state.value.dialogError)

        vm.clearDialogError()
        assertNull(vm.state.value.dialogError)

        vm.updateRule(
            ruleId = "r1",
            unitCategory = "",
            thresholdText = "85",
            severity = AlertSeverity.WARNING,
            isActive = true
        )
        assertEquals("Unit category is required", vm.state.value.dialogError)

        // Invalid threshold bounds in production createRule & updateRule
        for (badThreshold in listOf("", "abc", "0", "0.9", "100.1", "150")) {
            vm.clearDialogError()
            vm.createRule(unitCategory = "PICU", thresholdText = badThreshold)
            assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)

            vm.clearDialogError()
            vm.updateRule(
                ruleId = "r1",
                unitCategory = "PICU",
                thresholdText = badThreshold,
                severity = AlertSeverity.CRITICAL,
                isActive = true
            )
            assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)
        }
    }

    /**
     * Verifies that an [AlertRuleResponse] model maps all expected fields for edit dialog pre-population.
     */
    @Test
    fun testAlertRuleResponseMappingForEdit() {
        val now = kotlin.time.Instant.fromEpochMilliseconds(1750000000000L)
        val rule = AlertRuleResponse(
            id = "rule-uuid-1234",
            unitCategory = "Emergency",
            thresholdPercentage = 88.0,
            severity = AlertSeverity.WARNING,
            isActive = true,
            createdAt = now
        )

        assertNotNull(rule.createdAt)
        assertEquals("rule-uuid-1234", rule.id)
        assertEquals("Emergency", rule.unitCategory)
        assertEquals(88.0, rule.thresholdPercentage)
        assertEquals(AlertSeverity.WARNING, rule.severity)
        assertTrue(rule.isActive ?: false)
    }
}
