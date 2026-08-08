package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.apis.SimulationApi
import io.healthplatform.pulsequery.api.models.ScenarioResult
import io.healthplatform.pulsequery.api.models.ScenarioRunRequest
import io.healthplatform.pulsequery.api.infrastructure.HttpResponse
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class WizardViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)

    @BeforeTest
    fun setup() {
        Dispatchers.setMain(testDispatcher)
    }

    @AfterTest
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun testStartScenario_UnitAssignment() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        
        viewModel.startScenario(WizardUseCase.UNIT_ASSIGNMENT)
        
        val state = viewModel.state.first()
        assertTrue(state is WizardState.ContextGathering)
        assertEquals(WizardUseCase.UNIT_ASSIGNMENT, state.useCase)
        assertEquals(1, state.messages.size)
        assertEquals(false, state.messages[0].isUser)
        assertTrue(state.messages[0].text.contains("optimize service-unit assignments"))
    }

    @Test
    fun testStartScenario_SurgicalScheduling() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        
        viewModel.startScenario(WizardUseCase.SURGICAL_SCHEDULING)
        
        val state = viewModel.state.first()
        assertTrue(state is WizardState.ContextGathering)
        assertEquals(WizardUseCase.SURGICAL_SCHEDULING, state.useCase)
        assertEquals(1, state.messages.size)
        assertTrue(state.messages[0].text.contains("optimize surgical schedules"))
    }

    @Test
    fun testStartScenario_Staffing() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        
        viewModel.startScenario(WizardUseCase.STAFFING)
        
        val state = viewModel.state.first()
        assertTrue(state is WizardState.ContextGathering)
        assertEquals(WizardUseCase.STAFFING, state.useCase)
        assertEquals(1, state.messages.size)
        assertTrue(state.messages[0].text.contains("optimize nurse staffing"))
    }

    @Test
    fun testSubmitMessage_FromContextGatheringToConstraintIdentification() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        
        viewModel.startScenario(WizardUseCase.UNIT_ASSIGNMENT)
        viewModel.submitMessage("I want to restrict orthopedics to WARD A.")
        
        val state = viewModel.state.first()
        assertTrue(state is WizardState.ConstraintIdentification)
        assertEquals(3, state.messages.size) // 1 initial + 1 user + 1 followup
        assertEquals(true, state.messages[1].isUser)
        assertEquals("I want to restrict orthopedics to WARD A.", state.messages[1].text)
        assertEquals(false, state.messages[2].isUser)
    }
    
    @Test
    fun testReset() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        viewModel.startScenario(WizardUseCase.UNIT_ASSIGNMENT)
        viewModel.reset()
        
        val state = viewModel.state.first()
        assertTrue(state is WizardState.Landing)
    }
}
