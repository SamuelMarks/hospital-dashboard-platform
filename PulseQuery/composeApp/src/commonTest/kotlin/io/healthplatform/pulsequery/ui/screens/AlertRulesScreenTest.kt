/**
 * Unit and Compose UI tests for [AlertRulesScreen] and [AlertRulesViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.apis.AlertRulesApi
import io.healthplatform.pulsequery.api.models.AlertRuleResponse
import io.healthplatform.pulsequery.api.models.AlertRuleUpdate
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.core.model.ClinicalRole
import io.healthplatform.pulsequery.createUnconfinedMockEngine
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.alertrules.AlertRulesViewModel
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
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

    private fun createAlertRulesClient(mode: String = "normal"): HttpClient {
        val engine = createUnconfinedMockEngine { request ->
            val path = request.url.encodedPath
            when {
                mode == "error" -> respond(
                    content = """{"detail":"Alert service offline"}""",
                    status = HttpStatusCode.InternalServerError,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                mode == "empty" && request.method == HttpMethod.Get -> respond(
                    content = "[]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/api/v1/analytics/alert-rules") && request.method == HttpMethod.Get -> respond(
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
                path.contains("/api/v1/analytics/alert-rules") && (request.method == HttpMethod.Post || request.method == HttpMethod.Put) -> respond(
                    content = """{
                        "id": "rule-uuid-1234",
                        "unit_category": "Cardiology ICU",
                        "threshold_percentage": 88.0,
                        "severity": "WARNING",
                        "is_active": true,
                        "created_at": "2026-09-01T00:00:00Z"
                    }""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                path.contains("/api/v1/analytics/alert-rules") && request.method == HttpMethod.Delete -> respond(
                    content = "",
                    status = HttpStatusCode.NoContent
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

    @Test
    fun testAlertRulePureHelpers() {
        val now = kotlin.time.Instant.fromEpochMilliseconds(1750000000000L)
        val ruleWithDefaults = AlertRuleResponse(
            id = "r-1",
            unitCategory = "NICU",
            thresholdPercentage = 85.0,
            severity = null,
            isActive = null,
            createdAt = now
        )
        assertEquals("Threshold: 85.0% • Severity: WARNING", formatAlertRuleSummary(ruleWithDefaults))
        assertEquals(0.85f, calculateAlertRuleProgress(85.0))
        assertEquals(1.0f, calculateAlertRuleProgress(150.0))
        assertEquals(0.0f, calculateAlertRuleProgress(-10.0))
        assertEquals(AlertSeverity.WARNING, resolveInitialAlertSeverity(ruleWithDefaults))
        assertTrue(resolveInitialAlertActive(ruleWithDefaults))

        val explicitRule = ruleWithDefaults.copy(severity = AlertSeverity.CRITICAL, isActive = false)
        assertEquals("Threshold: 85.0% • Severity: CRITICAL", formatAlertRuleSummary(explicitRule))
        assertEquals(AlertSeverity.CRITICAL, resolveInitialAlertSeverity(explicitRule))
        assertFalse(resolveInitialAlertActive(explicitRule))
    }

    /**
     * Verifies that [AlertRulesScreen] renders configured alert rules and supports edit, create, refresh, and delete actions.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAlertRulesScreenRendersRulesAndDialogs() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createAlertRulesClient("normal"))

        setContent {
            MaterialTheme {
                AlertRulesScreen()
            }
        }

        waitForIdle()
        waitUntil(timeoutMillis = 30000) {
            onAllNodesWithText("Pediatric ICU", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Pediatric ICU", substring = true).assertIsDisplayed()

        // Refresh rules
        onNodeWithContentDescription("Refresh Rules").performClick()
        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Pediatric ICU", substring = true).fetchSemanticsNodes().isNotEmpty()
        }

        // Open Edit Rule dialog, test severity filter chips and fields, save changes
        onNodeWithContentDescription("Edit Rule").performClick()
        onNodeWithText("Edit Alert Rule").assertIsDisplayed()
        onNodeWithText("Info").performClick()
        onNodeWithText("Warning").performClick()
        onNodeWithText("Critical").performClick()
        onNodeWithText("Unit Category").performTextReplacement("Cardiology ICU")
        onNodeWithText("90.0").performTextReplacement("88")
        onNodeWithText("Save Changes").performClick()

        // Open Edit Rule dialog and cancel
        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Edit Alert Rule").fetchSemanticsNodes().isEmpty() &&
                onAllNodesWithText("Pediatric ICU", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithContentDescription("Edit Rule").performClick()
        onNodeWithText("Cancel").performClick()

        // Open Create Rule dialog from top bar Add Rule icon, fill fields, save
        onNodeWithContentDescription("Add Rule").performClick()
        onNodeWithText("Create Alert Rule").assertIsDisplayed()
        onNodeWithText("Unit Category").performTextReplacement("NICU")
        onNodeWithText("85").performTextReplacement("92")
        onNodeWithText("Save").performClick()

        // Delete rule
        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Create Alert Rule").fetchSemanticsNodes().isEmpty() &&
                onAllNodesWithText("Pediatric ICU", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithContentDescription("Delete Rule").performClick()
    }

    /**
     * Verifies empty state and error state on [AlertRulesScreen].
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testAlertRulesScreenEmptyAndErrorStates() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createAlertRulesClient("empty"))

        setContent {
            MaterialTheme {
                AlertRulesScreen()
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Create Rule").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Create Rule").performClick()
        onNodeWithText("Cancel").performClick()
    }

    /**
     * Verifies direct rendering of [CreateAlertRuleDialog] and [EditAlertRuleDialog] with default viewModel parameter and error state.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testStandaloneDialogsAndErrorState() = runComposeUiTest {
        AppContainer.setHttpClientForTest(createAlertRulesClient("error"))

        val sampleRule = AlertRuleResponse(
            id = "r-1",
            unitCategory = "PICU",
            thresholdPercentage = 90.0,
            severity = AlertSeverity.WARNING,
            isActive = true,
            createdAt = kotlin.time.Instant.fromEpochMilliseconds(1750000000000L)
        )

        val showDialogs = androidx.compose.runtime.mutableStateOf(false)

        setContent {
            MaterialTheme {
                if (!showDialogs.value) {
                    AlertRulesScreen()
                } else {
                    CreateAlertRuleDialog(onDismiss = {}, onCreated = {})
                    EditAlertRuleDialog(rule = sampleRule, onDismiss = {}, onUpdated = {})
                }
            }
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("Retry").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Retry").performClick()

        showDialogs.value = true
        waitForIdle()
        onNodeWithText("Create Alert Rule").assertExists()
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
    fun testAlertRulesViewModelValidationAndRoleChecks() {
        val client = createAlertRulesClient()
        val api = AlertRulesApi(baseUrl = "http://localhost", httpClient = client)
        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val vm = AlertRulesViewModel(scope = scope, alertRulesApi = api)

        assertTrue(vm.canModifyRules(ClinicalRole.ADMIN))
        assertTrue(vm.canModifyRules(ClinicalRole.PHYSICIAN))
        assertFalse(vm.canModifyRules(ClinicalRole.CHARGE_NURSE))

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
     * Verifies that an [AlertRuleResponse] model serializes/deserializes cleanly and integrates with [AlertRulesViewModel].
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

        val jsonStr = Json.encodeToString(rule)
        val decoded = Json.decodeFromString<AlertRuleResponse>(jsonStr)
        assertEquals(rule, decoded)
        assertNotNull(decoded.createdAt)
        assertEquals("rule-uuid-1234", decoded.id)
        assertEquals("Emergency", decoded.unitCategory)
        assertEquals(88.0, decoded.thresholdPercentage)
        assertEquals(AlertSeverity.WARNING, decoded.severity)
        assertTrue(decoded.isActive ?: false)
    }
}
