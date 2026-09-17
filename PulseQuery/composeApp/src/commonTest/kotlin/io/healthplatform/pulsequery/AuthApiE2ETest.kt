package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * End-to-end authentication flow integration tests for PulseQuery client.
 */
class AuthApiE2ETest {

    /**
     * Verifies that user registration, credential login, and /users/me verification succeed cleanly.
     */
    @Test
    fun testLoginAndFetchMe() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        AppContainer.setHttpClientForTest(createMockClient())

        val email = "test_e2e_${io.ktor.util.date.getTimeMillis()}@example.com"
        val password = "StrongPassword123!"

        // Register
        val registerResponse = AppContainer.authApi.registerUserApiV1AuthRegisterPost(
            UserCreate(email = email, password = password)
        )
        assertTrue(registerResponse.success, "Registration failed: ${registerResponse.status}")

        // Login & Me verification with runCatching
        runCatching {
            val loginResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
                username = email,
                password = password,
                grantType = "password"
            )
            assertTrue(loginResponse.success, "Login failed: ${loginResponse.status}")

            val token = loginResponse.body().accessToken
            assertNotNull(token)

            AppContainer.currentToken = token

            // Fetch Me
            val meResponse = AppContainer.authApi.readUsersMeApiV1AuthMeGet()
            assertTrue(meResponse.success, "Fetch Me failed: ${meResponse.status}")
        }.onFailure { e ->
            println("EXCEPTION CAUGHT: ${e.message}")
        }.getOrThrow()
    }
}
