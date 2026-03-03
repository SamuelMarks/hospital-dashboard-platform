package io.healthplatform.pulsequery.ui.wizard

import io.healthplatform.pulsequery.ui.screens.wizard.WizardState
import io.healthplatform.pulsequery.ui.screens.wizard.WizardUseCase
import io.healthplatform.pulsequery.ui.screens.wizard.WizardViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
    fun testInitialStateIsLanding() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        assertTrue(viewModel.state.value is WizardState.Landing)
    }

    @Test
    fun testStartScenarioTransitionsToContextGathering() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        viewModel.startScenario(WizardUseCase.SURGICAL_SCHEDULING)

        val state = viewModel.state.value
        assertTrue(state is WizardState.ContextGathering)
        assertEquals(WizardUseCase.SURGICAL_SCHEDULING, (state as WizardState.ContextGathering).useCase)
        assertEquals(1, state.messages.size)
        assertEquals(false, state.messages.first().isUser)
    }

    @Test
    fun testSubmitMessageAdvancesStateToConstraintIdentification() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        viewModel.startScenario(WizardUseCase.UNIT_ASSIGNMENT)
        viewModel.submitMessage("I want to lock Dr. Smith in OR 4.")

        val state = viewModel.state.value
        assertTrue(state is WizardState.ConstraintIdentification)
        val messages = (state as WizardState.ConstraintIdentification).messages
        
        // Initial msg + User msg + Follow up msg = 3 messages
        assertEquals(3, messages.size)
        assertTrue(messages[1].isUser)
        assertEquals("I want to lock Dr. Smith in OR 4.", messages[1].text)
        assertEquals(false, messages[2].isUser)
    }

    @Test
    fun testResetReturnsToLanding() = testScope.runTest {
        val viewModel = WizardViewModel(this)
        viewModel.startScenario(WizardUseCase.STAFFING)
        viewModel.reset()

        assertTrue(viewModel.state.value is WizardState.Landing)
    }
}
