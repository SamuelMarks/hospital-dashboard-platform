package io.healthplatform.pulsequery.ui.screens.admin

import io.healthplatform.pulsequery.api.apis.AdminApi
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [AdminViewModel] and [AdminUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AdminViewModelTest {

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

    private val settingsJson = """
        {
            "api_keys": {"openai": "sk-123"},
            "visible_models": ["gpt-4o"]
        }
    """.trimIndent()

    @Test
    fun testAdminUiStateProperties() {
        val state = AdminUiState(
            apiKeys = mapOf("k" to "v"),
            visibleModels = listOf("m1"),
            isLoading = false,
            errorMessage = "err"
        )
        assertEquals(mapOf("k" to "v"), state.apiKeys)
        assertEquals(listOf("m1"), state.visibleModels)
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testLoadSettingsAndLocalMutations() = kotlinx.coroutines.runBlocking {
        val engine = MockEngine {
            respond(
                content = settingsJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        AppContainer.setHttpClientForTest(createClient(engine))

        val vm = AdminViewModel(scope = this)
        vm.loadSettings()
        kotlinx.coroutines.delay(50)
        assertEquals(mapOf("openai" to "sk-123"), vm.state.value.apiKeys)
        assertEquals(listOf("gpt-4o"), vm.state.value.visibleModels)
        assertFalse(vm.state.value.isLoading)
        assertNull(vm.state.value.errorMessage)

        // putApiKey guards and success
        vm.putApiKey("  ", "key")
        vm.putApiKey("anthropic", "  ")
        assertEquals(1, vm.state.value.apiKeys.size)
        vm.putApiKey("anthropic", "sk-ant")
        assertEquals("sk-ant", vm.state.value.apiKeys["anthropic"])

        // removeApiKey
        vm.removeApiKey("openai")
        assertEquals(mapOf("anthropic" to "sk-ant"), vm.state.value.apiKeys)

        // addVisibleModel guards, duplicate, and new
        vm.addVisibleModel("   ")
        vm.addVisibleModel("gpt-4o")
        assertEquals(listOf("gpt-4o"), vm.state.value.visibleModels)
        vm.addVisibleModel("claude-3-5-sonnet")
        assertEquals(listOf("gpt-4o", "claude-3-5-sonnet"), vm.state.value.visibleModels)

        // removeVisibleModel
        vm.removeVisibleModel("gpt-4o")
        assertEquals(listOf("claude-3-5-sonnet"), vm.state.value.visibleModels)
    }

    @Test
    fun testLoadSettingsFailures() = kotlinx.coroutines.runBlocking {
        val engineMsg = MockEngine { throw IllegalStateException("Unauthorized") }
        val vm1 = AdminViewModel(
            scope = this,
            adminApi = AdminApi(baseUrl = "http://localhost", httpClient = createClient(engineMsg))
        )
        vm1.loadSettings("Custom prefix: ")
        kotlinx.coroutines.delay(50)
        assertEquals("Custom prefix: Unauthorized", vm1.state.value.errorMessage)

        val engineNull = MockEngine { throw RuntimeException(null as String?) }
        val vm2 = AdminViewModel(
            scope = this,
            adminApi = AdminApi(baseUrl = "http://localhost", httpClient = createClient(engineNull))
        )
        vm2.loadSettings()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load admin settings: Unknown error", vm2.state.value.errorMessage)
    }

    @Test
    fun testSaveSettingsSuccessAndFailures() = kotlinx.coroutines.runBlocking {
        val engine = MockEngine {
            respond(
                content = settingsJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val vm = AdminViewModel(
            scope = this,
            adminApi = AdminApi(baseUrl = "http://localhost", httpClient = createClient(engine))
        )
        val notifications = mutableListOf<String>()
        val job = launch {
            vm.notifications.collect { notifications.add(it) }
        }

        vm.saveSettings()
        kotlinx.coroutines.delay(50)
        assertNull(vm.state.value.errorMessage)
        assertTrue(notifications.contains("Settings saved successfully"))

        // Save failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("Write error") }
        val vmFail1 = AdminViewModel(
            scope = this,
            adminApi = AdminApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg))
        )
        vmFail1.saveSettings(successMessage = "Saved", errorPrefix = "Save err: ")
        kotlinx.coroutines.delay(50)
        assertEquals("Save err: Write error", vmFail1.state.value.errorMessage)

        // Save failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFail2 = AdminViewModel(
            scope = this,
            adminApi = AdminApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull))
        )
        vmFail2.saveSettings()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to save admin settings: Unknown error", vmFail2.state.value.errorMessage)

        job.cancel()
    }
}
