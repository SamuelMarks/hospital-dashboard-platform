package io.healthplatform.pulsequery.ui.screens.mpax

import io.healthplatform.pulsequery.api.apis.MpaxArenaApi
import io.healthplatform.pulsequery.api.models.MpaxArenaCandidate
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
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [MpaxArenaViewModel] and [MpaxArenaUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class MpaxArenaViewModelTest {

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

    @Test
    fun testMpaxArenaModesAndUiStateProperties() {
        assertEquals(4, MPAX_ARENA_MODES.size)
        val cand = MpaxArenaCandidate(id = "c1", modelName = "gpt-4o", content = "Solution", isSelected = true)
        val state = MpaxArenaUiState(
            prompt = "test",
            selectedMode = "translator",
            isRunning = false,
            isVoting = false,
            experimentId = "exp-1",
            errorMessage = "err",
            candidates = listOf(cand),
            selectedCandidateId = "c1"
        )
        assertEquals("test", state.prompt)
        assertEquals("translator", state.selectedMode)
        assertFalse(state.isRunning)
        assertFalse(state.isVoting)
        assertEquals("exp-1", state.experimentId)
        assertEquals("err", state.errorMessage)
        assertEquals(1, state.candidates.size)
        assertEquals("c1", state.selectedCandidateId)
    }

    @Test
    fun testUpdatePromptSelectModeAndRunArenaSuccessAndBlank() = kotlinx.coroutines.runBlocking {
        val runResponseJson = """
            {
                "experiment_id": "exp-99",
                "mode": "translator",
                "candidates": [
                    {"id": "c1", "model_name": "gpt-4o", "content": "A", "is_selected": false},
                    {"id": "c2", "model_name": "claude-3", "content": "B", "is_selected": true}
                ]
            }
        """.trimIndent()
        var callCount = 0
        val engine = MockEngine {
            callCount++
            respond(
                content = runResponseJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = createClient(engine)
        AppContainer.setHttpClientForTest(client)

        val vm = MpaxArenaViewModel(scope = this)
        vm.updatePrompt("   ")
        vm.selectMode("translator")
        assertEquals("translator", vm.state.value.selectedMode)

        // Blank prompt does not trigger API call
        vm.runArena()
        kotlinx.coroutines.delay(50)
        assertEquals(0, callCount)

        // Valid prompt triggers runArena and finds selected candidate c2
        vm.updatePrompt("Optimize ICU capacity")
        vm.runArena()
        kotlinx.coroutines.delay(50)
        assertEquals(1, callCount)
        assertEquals("exp-99", vm.state.value.experimentId)
        assertEquals(2, vm.state.value.candidates.size)
        assertEquals("c2", vm.state.value.selectedCandidateId)

        // Also test when no candidate has isSelected == true (or isSelected is null)
        val engineNoneSelected = MockEngine {
            respond(
                content = """{"experiment_id":"exp-100","mode":"critic","candidates":[{"id":"c1","model_name":"m1","content":"C","is_selected":null}]}""",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val explicitApi = MpaxArenaApi(baseUrl = "http://localhost", httpClient = createClient(engineNoneSelected))
        val vmExplicit = MpaxArenaViewModel(scope = this, mpaxArenaApi = explicitApi)
        vmExplicit.runArena()
        kotlinx.coroutines.delay(50)
        assertEquals("exp-100", vmExplicit.state.value.experimentId)
        assertNull(vmExplicit.state.value.selectedCandidateId)
    }

    @Test
    fun testRunArenaFailureWithAndWithoutMessage() = kotlinx.coroutines.runBlocking {
        val engineMsg = MockEngine { throw IllegalStateException("Arena timeout") }
        val api1 = MpaxArenaApi(baseUrl = "http://localhost", httpClient = createClient(engineMsg))
        val vm1 = MpaxArenaViewModel(scope = this, mpaxArenaApi = api1)
        vm1.runArena()
        kotlinx.coroutines.delay(50)
        assertEquals("Arena timeout", vm1.state.value.errorMessage)

        val engineNull = MockEngine { throw RuntimeException(null as String?) }
        val api2 = MpaxArenaApi(baseUrl = "http://localhost", httpClient = createClient(engineNull))
        val vm2 = MpaxArenaViewModel(scope = this, mpaxArenaApi = api2)
        vm2.runArena()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to execute MPAX Arena evaluation", vm2.state.value.errorMessage)
    }

    @Test
    fun testVoteCandidateGuardSuccessAndFailure() = kotlinx.coroutines.runBlocking {
        val voteResponseJson = """
            {
                "experiment_id": "exp-99",
                "mode": "critic",
                "candidates": [
                    {"id": "c1", "model_name": "gpt-4o", "content": "A", "is_selected": true}
                ]
            }
        """.trimIndent()
        var voteCalled = false
        val engine = MockEngine {
            voteCalled = true
            respond(
                content = voteResponseJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val api = MpaxArenaApi(baseUrl = "http://localhost", httpClient = createClient(engine))

        // When experimentId is null, voteCandidate returns early
        val vmNoExp = MpaxArenaViewModel(scope = this, mpaxArenaApi = api)
        vmNoExp.voteCandidate("c1")
        kotlinx.coroutines.delay(50)
        assertFalse(voteCalled)

        // When experimentId is present, voteCandidate succeeds
        val vmWithExp = MpaxArenaViewModel(
            scope = this,
            mpaxArenaApi = api,
            initialState = MpaxArenaUiState(experimentId = "exp-99")
        )
        vmWithExp.voteCandidate("c1")
        kotlinx.coroutines.delay(50)
        assertTrue(voteCalled)
        assertEquals("c1", vmWithExp.state.value.selectedCandidateId)
        assertFalse(vmWithExp.state.value.isVoting)

        // Vote failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("Vote conflict") }
        val vmFail1 = MpaxArenaViewModel(
            scope = this,
            mpaxArenaApi = MpaxArenaApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg)),
            initialState = MpaxArenaUiState(experimentId = "exp-99")
        )
        vmFail1.voteCandidate("c1")
        kotlinx.coroutines.delay(50)
        assertEquals("Vote conflict", vmFail1.state.value.errorMessage)

        // Vote failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFail2 = MpaxArenaViewModel(
            scope = this,
            mpaxArenaApi = MpaxArenaApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull)),
            initialState = MpaxArenaUiState(experimentId = "exp-99")
        )
        vmFail2.voteCandidate("c1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to record candidate vote", vmFail2.state.value.errorMessage)
    }
}
