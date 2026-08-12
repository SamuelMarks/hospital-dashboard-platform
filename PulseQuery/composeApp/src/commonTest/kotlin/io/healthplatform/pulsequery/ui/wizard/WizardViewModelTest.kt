package io.healthplatform.pulsequery.ui.wizard

import io.healthplatform.pulsequery.api.models.ScenarioResult
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.wizard.WizardState
import io.healthplatform.pulsequery.ui.screens.wizard.WizardUseCase
import io.healthplatform.pulsequery.ui.screens.wizard.WizardViewModel
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class WizardViewModelTest {

    private val testScheduler = TestCoroutineScheduler()
    private val testDispatcher = StandardTestDispatcher(testScheduler)
    private val testScope = TestScope(testDispatcher)

    @BeforeTest
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        AppContainer.currentBaseUrl = "http://localhost" // Reset container
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun setupMockApi(
        baseResultResponse: ScenarioResult? = null,
        branchResultResponse: ScenarioResult? = null,
        shouldFail: Boolean = false
    ) {
        AppContainer.currentBaseUrl = "http://localhost"
        var callCount = 0
        val mockEngine = MockEngine { request ->
            if (shouldFail) {
                respond("Internal Server Error", HttpStatusCode.InternalServerError)
            } else {
                callCount++
                val result = if (callCount == 1) baseResultResponse else branchResultResponse
                if (result == null) {
                    respond("{}", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
                } else {
                    respond(
                        content = Json.encodeToString(result),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @Test
    fun `test initial state is Landing`() = runTest(testDispatcher) {
        val viewModel = WizardViewModel(testScope)
        assertEquals(WizardState.Landing, viewModel.state.value)
    }

    @Test
    fun `test startScenario UNIT_ASSIGNMENT`() = runTest(testDispatcher) {
        val viewModel = WizardViewModel(testScope)
        viewModel.startScenario(WizardUseCase.UNIT_ASSIGNMENT)
        val state = viewModel.state.value as WizardState.ContextGathering
        assertEquals(WizardUseCase.UNIT_ASSIGNMENT, state.useCase)
        assertEquals(1, state.messages.size)
        assertTrue(state.messages[0].text.contains("optimize service-unit assignments"))
    }

    @Test
    fun `test submitMessage from ContextGathering transitions to ConstraintIdentification`() = runTest(testDispatcher) {
        val viewModel = WizardViewModel(testScope)
        viewModel.startScenario(WizardUseCase.SURGICAL_SCHEDULING)
        viewModel.submitMessage("I want to focus on general surgeries")

        val state = viewModel.state.value as WizardState.ConstraintIdentification
        assertEquals(WizardUseCase.SURGICAL_SCHEDULING, state.useCase)
        assertEquals(3, state.messages.size)
        assertTrue(state.messages[1].isUser)
        assertEquals("I want to focus on general surgeries", state.messages[1].text)
        assertTrue(state.messages[2].text.contains("pulling the relevant baseline data"))
        assertEquals(0, state.constraints.size)
    }

    @Test
    fun `test submitMessage from ConstraintIdentification executes simulation`() = runTest(testDispatcher) {
        val baseResult = ScenarioResult(emptyList(), "base", null)
        val branchResult = ScenarioResult(emptyList(), "branch", null)
        setupMockApi(baseResult, branchResult)

        val viewModel = WizardViewModel(testScope)
        viewModel.startScenario(WizardUseCase.STAFFING)
        viewModel.submitMessage("focus on overtime") // -> ConstraintIdentification
        viewModel.submitMessage("lock ICU nurses") // -> triggers execution

        val stateValue = viewModel.state.first { it is WizardState.Execution }
        val state = stateValue as WizardState.Execution
        assertEquals(WizardUseCase.STAFFING, state.useCase)
        assertEquals(baseResult, state.baseResult)
        assertEquals(branchResult, state.branchResult)
    }

    @Test
    fun `test submitMessage from ConstraintIdentification failure`() = runTest(testDispatcher) {
        setupMockApi(shouldFail = true)

        val viewModel = WizardViewModel(testScope)
        viewModel.startScenario(WizardUseCase.STAFFING)
        viewModel.submitMessage("focus on overtime") // -> ConstraintIdentification
        viewModel.submitMessage("lock ICU nurses") // -> triggers execution

        val stateValue = viewModel.state.first { 
            it is WizardState.ContextGathering && it.messages.last().text.contains("Execution failed") 
        }
        val state = stateValue as WizardState.ContextGathering
        assertEquals(WizardUseCase.STAFFING, state.useCase)
        assertTrue(state.messages.last().text.contains("Execution failed"))
    }

    @Test
    fun `test submitMessage from Execution transitions to Refinement and executes`() = runTest(testDispatcher) {
        val baseResult = ScenarioResult(emptyList(), "base", null)
        val branchResult = ScenarioResult(emptyList(), "branch", null)
        setupMockApi(baseResult, branchResult)

        val viewModel = WizardViewModel(testScope)
        viewModel.startScenario(WizardUseCase.STAFFING)
        viewModel.submitMessage("focus on overtime")
        viewModel.submitMessage("lock ICU nurses")

        viewModel.state.first { it is WizardState.Execution } // Wait for first execution

        // Now we are in Execution state
        setupMockApi(baseResult, branchResult) // reset mock for next execution
        viewModel.submitMessage("make it cheaper")

        // It transitions to Refinement then Execution
        val stateValue = viewModel.state.first { it is WizardState.Execution }
        val state = stateValue as WizardState.Execution
        assertEquals(WizardUseCase.STAFFING, state.useCase)
    }

    @Test
    fun `test submitMessage from Refinement executes again`() = runTest(testDispatcher) {
        val baseResult = ScenarioResult(emptyList(), "base", null)
        val branchResult = ScenarioResult(emptyList(), "branch", null)
        setupMockApi(baseResult, branchResult)

        val viewModel = WizardViewModel(testScope)
        
        // Progress state normally instead of hacking
        viewModel.startScenario(WizardUseCase.STAFFING)
        viewModel.submitMessage("msg1")
        viewModel.submitMessage("msg2")
        
        viewModel.state.first { it is WizardState.Execution }
        
        // Now in Execution, submit to get to Refinement/re-execute
        viewModel.submitMessage("refine1")
        
        // Verify we went back to Execution (since Refinement automatically triggers execution)
        viewModel.state.first { it is WizardState.Execution }
        
        AppContainer.currentBaseUrl = "http://localhost" // Reset cached APIs
        setupMockApi(shouldFail = true)
        
        // From Execution state, submit again
        viewModel.submitMessage("another refinement") 
        
        val finalState = viewModel.state.first { it is WizardState.ContextGathering && it.messages.last().text.contains("Execution failed") }
        assertTrue(finalState is WizardState.ContextGathering)
    }
    
    @Test
    fun `test reset`() = runTest(testDispatcher) {
        val viewModel = WizardViewModel(testScope)
        viewModel.startScenario(WizardUseCase.STAFFING)
        assertTrue(viewModel.state.value is WizardState.ContextGathering)
        viewModel.reset()
        assertEquals(WizardState.Landing, viewModel.state.value)
    }
}

