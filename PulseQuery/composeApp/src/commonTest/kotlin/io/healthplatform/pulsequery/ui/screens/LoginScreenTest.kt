package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToLog
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
import kotlin.test.assertTrue

class LoginScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
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

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testLoginScreenEmptyState() = runComposeUiTest {
        setContent {
            MaterialTheme {
                LoginScreen(onLoginSuccess = {})
            }
        }

        onNodeWithText("Welcome to PulseQuery").assertIsDisplayed()
        onNodeWithText("Login / Register").assertIsDisplayed()
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
        
        waitUntil(timeoutMillis = 5000) {
            onAllNodes(androidx.compose.ui.test.hasText("auto-registration also failed", substring = true)).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("auto-registration also failed", substring = true).assertIsDisplayed()
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

        // After click, wait for the state to settle
        waitUntil(timeoutMillis = 5000) { successCalled }
        
        assertTrue(successCalled)
    }
}
