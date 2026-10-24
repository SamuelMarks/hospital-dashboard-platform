package io.healthplatform.pulsequery.ui.screens.alertrules

import io.healthplatform.pulsequery.api.apis.AlertRulesApi
import io.healthplatform.pulsequery.api.models.AlertSeverity
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [AlertRulesViewModel] and [AlertRulesUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AlertRulesViewModelTest {

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

    private val sampleRuleJson = """
        {
            "id": "r-1",
            "unit_category": "ICU",
            "threshold_percentage": 85.0,
            "severity": "CRITICAL",
            "is_active": true,
            "created_at": "2026-01-01T00:00:00Z"
        }
    """.trimIndent()

    @Test
    fun testAlertRulesUiStateProperties() {
        val state = AlertRulesUiState(
            rules = emptyList(),
            isLoading = false,
            errorMessage = "err",
            isSaving = true,
            dialogError = "dErr"
        )
        assertTrue(state.rules.isEmpty())
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
        assertTrue(state.isSaving)
        assertEquals("dErr", state.dialogError)
    }

    @Test
    fun testLoadRulesSuccessAndFailure() = kotlinx.coroutines.runBlocking {
        val engineSuccess = MockEngine {
            respond(
                content = "[$sampleRuleJson]",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        AppContainer.setHttpClientForTest(createClient(engineSuccess))

        val vmDefault = AlertRulesViewModel(scope = this)
        vmDefault.loadRules()
        kotlinx.coroutines.delay(50)
        assertEquals(1, vmDefault.state.value.rules.size)
        assertEquals("ICU", vmDefault.state.value.rules[0].unitCategory)
        assertFalse(vmDefault.state.value.isLoading)
        assertNull(vmDefault.state.value.errorMessage)

        // Failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("DB down") }
        val vmFailMsg = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg))
        )
        vmFailMsg.loadRules()
        kotlinx.coroutines.delay(50)
        assertEquals("DB down", vmFailMsg.state.value.errorMessage)

        // Failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFailNull = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull))
        )
        vmFailNull.loadRules()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load alert rules", vmFailNull.state.value.errorMessage)
    }

    @Test
    fun testDeleteRuleSuccessAndFailure() = kotlinx.coroutines.runBlocking {
        var deleteCount = 0
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Delete) {
                deleteCount++
                respond(content = "", status = HttpStatusCode.NoContent)
            } else {
                respond(
                    content = "[]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val vm = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engine))
        )
        vm.deleteRule("r-1")
        kotlinx.coroutines.delay(50)
        assertEquals(1, deleteCount)
        assertTrue(vm.state.value.rules.isEmpty())

        // Delete failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("Cannot delete") }
        val vmFail1 = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg))
        )
        vmFail1.deleteRule("r-1")
        kotlinx.coroutines.delay(50)
        assertEquals("Cannot delete", vmFail1.state.value.errorMessage)

        // Delete failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFail2 = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull))
        )
        vmFail2.deleteRule("r-1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to delete rule", vmFail2.state.value.errorMessage)
    }

    @Test
    fun testCreateRuleValidationSuccessAndFailure() = kotlinx.coroutines.runBlocking {
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Post) {
                respond(
                    content = sampleRuleJson,
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else {
                respond(
                    content = "[$sampleRuleJson]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val vm = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engine))
        )

        // Validation errors
        vm.createRule(unitCategory = "   ", thresholdText = "85")
        assertEquals("Unit category is required", vm.state.value.dialogError)
        vm.clearDialogError()
        assertNull(vm.state.value.dialogError)

        vm.createRule(unitCategory = "ICU", thresholdText = "abc")
        assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)

        vm.createRule(unitCategory = "ICU", thresholdText = "0.5")
        assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)

        vm.createRule(unitCategory = "ICU", thresholdText = "101")
        assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)

        // Success with default severity & onSuccess
        vm.createRule(unitCategory = " ICU ", thresholdText = "85")
        kotlinx.coroutines.delay(50)
        assertNull(vm.state.value.dialogError)
        assertFalse(vm.state.value.isSaving)

        // Success with explicit severity & onSuccess callback
        var callbackInvoked = false
        vm.createRule(
            unitCategory = "ICU",
            thresholdText = "90",
            severity = AlertSeverity.CRITICAL,
            onSuccess = { callbackInvoked = true }
        )
        kotlinx.coroutines.delay(50)
        assertTrue(callbackInvoked)

        // Failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("Duplicate rule") }
        val vmFail1 = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg))
        )
        vmFail1.createRule(unitCategory = "ICU", thresholdText = "85")
        kotlinx.coroutines.delay(50)
        assertEquals("Duplicate rule", vmFail1.state.value.dialogError)

        // Failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFail2 = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull))
        )
        vmFail2.createRule(unitCategory = "ICU", thresholdText = "85")
        kotlinx.coroutines.delay(50)
        assertEquals("Creation failed", vmFail2.state.value.dialogError)
    }

    @Test
    fun testUpdateRuleValidationSuccessAndFailure() = kotlinx.coroutines.runBlocking {
        val engine = MockEngine { req ->
            if (req.method == HttpMethod.Put) {
                respond(
                    content = sampleRuleJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else {
                respond(
                    content = "[$sampleRuleJson]",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val vm = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engine))
        )

        // Validation errors
        vm.updateRule("r-1", "  ", "80", AlertSeverity.WARNING, true)
        assertEquals("Unit category is required", vm.state.value.dialogError)

        vm.updateRule("r-1", "ICU", "notanumber", AlertSeverity.WARNING, true)
        assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)

        vm.updateRule("r-1", "ICU", "0", AlertSeverity.WARNING, true)
        assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)

        vm.updateRule("r-1", "ICU", "105", AlertSeverity.WARNING, true)
        assertEquals("Threshold must be between 1 and 100", vm.state.value.dialogError)

        // Success with default callback
        vm.updateRule("r-1", " ICU ", "80", AlertSeverity.WARNING, false)
        kotlinx.coroutines.delay(50)
        assertNull(vm.state.value.dialogError)

        // Success with explicit callback
        var updatedCallback = false
        vm.updateRule("r-1", "ICU", "95", AlertSeverity.CRITICAL, true) {
            updatedCallback = true
        }
        kotlinx.coroutines.delay(50)
        assertTrue(updatedCallback)

        // Failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("Update rejected") }
        val vmFail1 = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg))
        )
        vmFail1.updateRule("r-1", "ICU", "80", AlertSeverity.WARNING, true)
        kotlinx.coroutines.delay(50)
        assertEquals("Update rejected", vmFail1.state.value.dialogError)

        // Failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFail2 = AlertRulesViewModel(
            scope = this,
            alertRulesApi = AlertRulesApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull))
        )
        vmFail2.updateRule("r-1", "ICU", "80", AlertSeverity.WARNING, true)
        kotlinx.coroutines.delay(50)
        assertEquals("Update failed", vmFail2.state.value.dialogError)
    }
}
