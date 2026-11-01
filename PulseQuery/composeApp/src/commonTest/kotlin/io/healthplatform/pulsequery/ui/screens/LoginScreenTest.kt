/**
 * Unit and Compose UI tests for [LoginScreen].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.printToLog
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.auth.AuthViewModel
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
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Verifies [LoginScreen] authentication flows, settings dialog, and registration navigation.
 */
class LoginScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(shouldFail: Boolean = false) {
        val mockEngine = MockEngine { request ->
            if (shouldFail) {
                respond("Unauthorized", HttpStatusCode.Unauthorized)
            } else {
                if (request.url.encodedPath.contains("auth/login")) {
                    respond(
                        """{"access_token":"mock_token","token_type":"bearer"}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                } else if (request.url.encodedPath.contains("auth/me")) {
                    respond(
                        """{"id":"1","email":"test@test.com","is_active":true,"is_admin":false}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                } else {
                    respond("Not Found", HttpStatusCode.NotFound)
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
    fun testHandleRegisterNavigationOrToggleHelper() {
        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val vm = AuthViewModel(scope = scope)
        assertFalse(vm.state.value.isRegisterMode)

        handleRegisterNavigationOrToggle(onNavigateToRegister = null, vm = vm)
        assertTrue(vm.state.value.isRegisterMode)

        var externalNavCalled = false
        handleRegisterNavigationOrToggle(
            onNavigateToRegister = { externalNavCalled = true },
            vm = vm
        )
        assertTrue(externalNavCalled)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLoginScreenEmptyStateAndSettingsDialog() = runComposeUiTest {
        var navigatedToRegister = false
        setContent {
            MaterialTheme {
                LoginScreen(
                    onLoginSuccess = {},
                    onNavigateToRegister = { navigatedToRegister = true }
                )
            }
        }

        onNodeWithText("Welcome to PulseQuery").assertIsDisplayed()
        onNodeWithText("Login / Register").assertIsDisplayed()

        // Open settings dialog, edit URL, and cancel
        onNodeWithText("⚙️").performClick()
        onNodeWithText("Settings").assertIsDisplayed()
        onNodeWithText("Cancel").performClick()

        // Re-open settings dialog, edit URL, and save
        onNodeWithText("⚙️").performClick()
        onNodeWithText("http://localhost").performTextReplacement("http://10.0.2.2:8000")
        onNodeWithText("Save").performClick()
        assertEquals("http://10.0.2.2:8000", AppContainer.currentBaseUrl)

        // Click register button with external navigation callback
        onNodeWithText("Need an account? Register").performClick()
        assertTrue(navigatedToRegister)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLoginScreenErrorStateEmptyFields() = runComposeUiTest {
        setContent {
            MaterialTheme {
                LoginScreen(onLoginSuccess = {})
            }
        }

        onNodeWithText("Login / Register").performClick()
        onNodeWithText("Email and Password cannot be empty.").assertIsDisplayed()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLoginScreenErrorStateApiFail() = runComposeUiTest {
        setupMockApi(shouldFail = true)

        setContent {
            MaterialTheme {
                LoginScreen(onLoginSuccess = {})
            }
        }

        onNodeWithText("Email").performTextInput("test@test.com")
        onNodeWithText("Password").performTextInput("password")
        onNodeWithText("Login / Register").performClick()

        waitUntil(timeoutMillis = 15000) {
            onAllNodes(hasText("Invalid username or password.", substring = true)).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Invalid username or password.", substring = true).assertIsDisplayed()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLoginScreenToggleRegisterMode() = runComposeUiTest {
        setContent {
            MaterialTheme {
                LoginScreen(onLoginSuccess = {})
            }
        }

        onNodeWithText("Need an account? Register").performClick()
        onNodeWithText("Register").assertIsDisplayed()
        onNodeWithText("Already have an account? Log In").performClick()
        onNodeWithText("Login / Register").assertIsDisplayed()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLoginScreenSuccessState() = runComposeUiTest {
        setupMockApi(shouldFail = false)

        var successCalled = false
        setContent {
            MaterialTheme {
                LoginScreen(onLoginSuccess = { successCalled = true })
            }
        }

        onNodeWithText("Email").performTextInput("test@test.com")
        onNodeWithText("Password").performTextInput("password")
        onNodeWithText("Login / Register").performClick()

        onRoot().printToLog("LoginScreenTest")

        waitUntil(timeoutMillis = 15000) { successCalled }

        assertTrue(successCalled)
    }
}
