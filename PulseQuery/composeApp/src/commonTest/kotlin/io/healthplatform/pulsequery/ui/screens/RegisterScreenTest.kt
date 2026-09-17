/**
 * Unit tests for the RegisterScreen component.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Compose UI tests verifying input validation, user registration, and navigation in RegisterScreen.
 */
class RegisterScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    /**
     * Sets up mock HTTP engine for registration API endpoints.
     *
     * @param shouldSucceed Whether registration should succeed.
     * @param emailExists Whether registration fails due to duplicate email.
     */
    private fun setupMockApi(shouldSucceed: Boolean = true, emailExists: Boolean = false) {
        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath
            when {
                path.contains("system/health") -> {
                    respond(
                        """{"overall_status":"healthy","timestamp":"2026-09-14T12:00:00Z","postgres":{"status":"connected"},"duckdb":{"status":"ready","total_tables":1,"tables":{}},"data":{"has_default_data":true,"fallback_generated":false,"missing_files":[],"row_counts":{}},"templates":{"templates_loaded":1,"has_templates":true,"missing_file":false},"llm":{"providers_count":1,"mock_mode":false,"models":[]},"warnings":[]}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, "application/json")
                    )
                }
                emailExists -> {
                    respond(
                        """{"detail":"Email already registered"}""",
                        HttpStatusCode.BadRequest,
                        headersOf(HttpHeaders.ContentType, "application/json")
                    )
                }
                !shouldSucceed -> {
                    respond("Server Error", HttpStatusCode.InternalServerError)
                }
                path.contains("/auth/register") -> {
                    respond(
                        """{"id":"u-new","email":"newuser@hospital.org","is_active":true,"is_admin":false,"language_preference":"en"}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, "application/json")
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
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
    fun testRegisterScreenValidationMismatchedPassword() = runComposeUiTest {
        setupMockApi(shouldSucceed = true)

        setContent {
            MaterialTheme {
                RegisterScreen(
                    onRegisterSuccess = {},
                    onNavigateToLogin = {}
                )
            }
        }

        onNodeWithText("Email Address").performTextInput("test@hospital.org")
        onNodeWithText("Password").performTextInput("secret123")
        onNodeWithText("Confirm Password").performTextInput("different123")
        onNodeWithText("Register Account").performScrollTo().performClick()

        onNodeWithText("Passwords do not match.").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testRegisterScreenValidationShortPassword() = runComposeUiTest {
        setupMockApi(shouldSucceed = true)

        setContent {
            MaterialTheme {
                RegisterScreen(
                    onRegisterSuccess = {},
                    onNavigateToLogin = {}
                )
            }
        }

        onNodeWithText("Email Address").performTextInput("test@hospital.org")
        onNodeWithText("Password").performTextInput("123")
        onNodeWithText("Confirm Password").performTextInput("123")
        onNodeWithText("Register Account").performScrollTo().performClick()

        onNodeWithText("Password must be at least 6 characters.").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testRegisterScreenSuccess() = runComposeUiTest {
        setupMockApi(shouldSucceed = true)
        var registered = false

        setContent {
            MaterialTheme {
                RegisterScreen(
                    onRegisterSuccess = { registered = true },
                    onNavigateToLogin = {}
                )
            }
        }

        onNodeWithText("Email Address").performTextInput("newuser@hospital.org")
        onNodeWithText("Password").performTextInput("validPassword123")
        onNodeWithText("Confirm Password").performTextInput("validPassword123")
        onNodeWithText("Register Account").performScrollTo().performClick()

        waitUntil(timeoutMillis = 5000) { registered }
        assertTrue(registered)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testRegisterScreenDuplicateEmailError() = runComposeUiTest {
        setupMockApi(shouldSucceed = false, emailExists = true)

        setContent {
            MaterialTheme {
                RegisterScreen(
                    onRegisterSuccess = {},
                    onNavigateToLogin = {}
                )
            }
        }

        onNodeWithText("Email Address").performTextInput("existing@hospital.org")
        onNodeWithText("Password").performTextInput("validPassword123")
        onNodeWithText("Confirm Password").performTextInput("validPassword123")
        onNodeWithText("Register Account").performScrollTo().performClick()

        waitUntil(timeoutMillis = 5000) {
            onAllNodesWithText("An account with this email already exists.").fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("An account with this email already exists.").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testRegisterScreenNavigateToLogin() = runComposeUiTest {
        setupMockApi(shouldSucceed = true)
        var navigatedToLogin = false

        setContent {
            MaterialTheme {
                RegisterScreen(
                    onRegisterSuccess = {},
                    onNavigateToLogin = { navigatedToLogin = true }
                )
            }
        }

        onNodeWithText("Already have an account? Sign In").performScrollTo().performClick()
        assertTrue(navigatedToLogin)
    }
}
