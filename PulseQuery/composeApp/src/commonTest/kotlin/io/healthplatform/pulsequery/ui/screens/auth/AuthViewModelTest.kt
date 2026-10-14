package io.healthplatform.pulsequery.ui.screens.auth

import io.healthplatform.pulsequery.api.apis.AuthApi
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
 * Comprehensive unit tests for [AuthViewModel] and [AuthUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    private fun createClient(engine: MockEngine, expectSuccess: Boolean = true): HttpClient = HttpClient(engine) {
        this.expectSuccess = expectSuccess
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; isLenient = true })
        }
    }

    private val userJson = """
        {
            "id": "u-1",
            "email": "doc@stanford.edu",
            "is_active": true,
            "is_admin": false,
            "role": "PHYSICIAN"
        }
    """.trimIndent()

    private val tokenJson = """
        {
            "access_token": "jwt-123",
            "token_type": "bearer"
        }
    """.trimIndent()

    @Test
    fun testAuthUiStateAndFieldMutations() {
        val state = AuthUiState(
            email = "a@b.c",
            password = "secret",
            confirmPassword = "secret",
            isLoading = false,
            errorMessage = "err",
            successMessage = "ok",
            passwordVisible = true,
            isRegisterMode = true,
            showSettingsDialog = true
        )
        assertEquals("a@b.c", state.email)
        assertEquals("secret", state.password)
        assertEquals("secret", state.confirmPassword)
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
        assertEquals("ok", state.successMessage)
        assertTrue(state.passwordVisible)
        assertTrue(state.isRegisterMode)
        assertTrue(state.showSettingsDialog)
    }

    @Test
    fun testInputMutationsAndSettingsDialog() = kotlinx.coroutines.runBlocking {
        val vm = AuthViewModel(scope = this)
        vm.updateEmail("doc@stanford.edu")
        vm.updatePassword("password123")
        vm.updateConfirmPassword("password123")
        assertEquals("doc@stanford.edu", vm.state.value.email)
        assertEquals("password123", vm.state.value.password)
        assertEquals("password123", vm.state.value.confirmPassword)

        vm.togglePasswordVisibility()
        assertTrue(vm.state.value.passwordVisible)
        vm.togglePasswordVisibility()
        assertFalse(vm.state.value.passwordVisible)

        vm.toggleRegisterMode()
        assertTrue(vm.state.value.isRegisterMode)
        vm.toggleRegisterMode()
        assertFalse(vm.state.value.isRegisterMode)

        vm.setShowSettingsDialog(true)
        assertTrue(vm.state.value.showSettingsDialog)
        vm.saveBaseUrl("https://new.pulsequery.io")
        assertFalse(vm.state.value.showSettingsDialog)
        assertEquals("https://new.pulsequery.io", AppContainer.currentBaseUrl)
    }

    @Test
    fun testLoginValidationSuccessAndProfileFailure() = kotlinx.coroutines.runBlocking {
        var meStatus = HttpStatusCode.OK
        val engine = MockEngine { req ->
            when {
                req.url.encodedPath.endsWith("/register") -> respond(
                    content = userJson,
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                req.url.encodedPath.endsWith("/login") -> respond(
                    content = tokenJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    content = userJson,
                    status = meStatus,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        AppContainer.setHttpClientForTest(createClient(engine, expectSuccess = false))

        val vm = AuthViewModel(scope = this)

        // Blank email or password
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        assertEquals("Empty", vm.state.value.errorMessage)
        vm.updateEmail("doc@stanford.edu")
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        assertEquals("Empty", vm.state.value.errorMessage)

        // Standard login success
        vm.updatePassword("password123")
        var loggedIn = false
        vm.login("Empty", "ProfileErr", "AuthErr") { loggedIn = true }
        kotlinx.coroutines.delay(50)
        assertTrue(loggedIn)
        assertEquals("jwt-123", AppContainer.currentToken)
        assertEquals("doc@stanford.edu", AppContainer.currentUser?.email)

        // Inline register + login mode success
        vm.toggleRegisterMode()
        var registeredAndLoggedIn = false
        vm.login("Empty", "ProfileErr", "AuthErr") { registeredAndLoggedIn = true }
        kotlinx.coroutines.delay(50)
        assertTrue(registeredAndLoggedIn)

        // Profile fetch failure (!meResponse.success)
        vm.toggleRegisterMode()
        meStatus = HttpStatusCode.InternalServerError
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("ProfileErr", vm.state.value.errorMessage)
    }

    @Test
    fun testLoginErrorFormattingBranches() = kotlinx.coroutines.runBlocking {
        var throwableToThrow: Throwable = IllegalStateException("401 Invalid")
        val engine = MockEngine { throw throwableToThrow }
        val api = AuthApi(baseUrl = "http://localhost", httpClient = createClient(engine))
        val vm = AuthViewModel(scope = this, authApi = api)
        vm.updateEmail("doc@stanford.edu")
        vm.updatePassword("password123")

        // 401
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("Invalid username or password.", vm.state.value.errorMessage)

        // Unauthorized
        throwableToThrow = IllegalStateException("Unauthorized access")
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("Invalid username or password.", vm.state.value.errorMessage)

        // Timeout
        throwableToThrow = IllegalStateException("Request timeout")
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("Network timeout. Please check your connection.", vm.state.value.errorMessage)

        // Fallback error in login mode
        throwableToThrow = RuntimeException(null as String?)
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("AuthErr", vm.state.value.errorMessage)

        // Inline register mode error: already registered
        vm.toggleRegisterMode()
        throwableToThrow = IllegalStateException("User already registered")
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("Registration failed: Email already registered", vm.state.value.errorMessage)

        // Inline register mode error: custom message
        throwableToThrow = IllegalStateException("Server busy")
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("Registration failed: Server busy", vm.state.value.errorMessage)

        // Inline register mode error: blank message falls back to errAuthFailed
        throwableToThrow = RuntimeException("")
        vm.login("Empty", "ProfileErr", "AuthErr") {}
        kotlinx.coroutines.delay(50)
        assertEquals("Registration failed: AuthErr", vm.state.value.errorMessage)
    }

    @Test
    fun testRegisterValidationSuccessAndFailures() = kotlinx.coroutines.runBlocking {
        var responseStatus = HttpStatusCode.Created
        val engine = MockEngine {
            respond(
                content = userJson,
                status = responseStatus,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val api = AuthApi(baseUrl = "http://localhost", httpClient = createClient(engine, expectSuccess = false))
        val vm = AuthViewModel(scope = this, authApi = api)

        // Validation: blank email, blank password, blank confirm
        vm.register {}
        assertEquals("All fields are required.", vm.state.value.errorMessage)
        vm.updateEmail("doc@stanford.edu")
        vm.register {}
        assertEquals("All fields are required.", vm.state.value.errorMessage)
        vm.updatePassword("12345")
        vm.register {}
        assertEquals("All fields are required.", vm.state.value.errorMessage)

        // Validation: password mismatch
        vm.updateConfirmPassword("different")
        vm.register {}
        assertEquals("Passwords do not match.", vm.state.value.errorMessage)

        // Validation: short password
        vm.updateConfirmPassword("12345")
        vm.register {}
        assertEquals("Password must be at least 6 characters.", vm.state.value.errorMessage)

        // Success
        vm.updatePassword("123456")
        vm.updateConfirmPassword("123456")
        var registered = false
        vm.register { registered = true }
        kotlinx.coroutines.delay(50)
        assertTrue(registered)
        assertEquals("Account created successfully! Please sign in.", vm.state.value.successMessage)

        // Non-exception HTTP 400 status
        responseStatus = HttpStatusCode.BadRequest
        vm.register {}
        kotlinx.coroutines.delay(50)
        assertEquals("An account with this email already exists.", vm.state.value.errorMessage)

        // Non-exception HTTP 500 status
        responseStatus = HttpStatusCode.InternalServerError
        vm.register {}
        kotlinx.coroutines.delay(50)
        assertEquals("Registration failed (Error 500).", vm.state.value.errorMessage)

        // Exception with "400"
        var errToThrow: Throwable = IllegalStateException("HTTP 400 Bad Request")
        val failApi = AuthApi(
            baseUrl = "http://localhost",
            httpClient = createClient(MockEngine { throw errToThrow })
        )
        val vmFail = AuthViewModel(scope = this, authApi = failApi)
        vmFail.updateEmail("doc@stanford.edu")
        vmFail.updatePassword("123456")
        vmFail.updateConfirmPassword("123456")
        vmFail.register {}
        kotlinx.coroutines.delay(50)
        assertEquals("An account with this email already exists.", vmFail.state.value.errorMessage)

        // Exception with "already registered"
        errToThrow = IllegalStateException("Email already registered")
        vmFail.register {}
        kotlinx.coroutines.delay(50)
        assertEquals("An account with this email already exists.", vmFail.state.value.errorMessage)

        // Exception with generic message
        errToThrow = IllegalStateException("Gateway error")
        vmFail.register {}
        kotlinx.coroutines.delay(50)
        assertEquals("Gateway error", vmFail.state.value.errorMessage)

        // Exception with null message
        errToThrow = RuntimeException(null as String?)
        vmFail.register {}
        kotlinx.coroutines.delay(50)
        assertEquals("Registration failed", vmFail.state.value.errorMessage)
    }
}
