/**
 * End-to-end authentication flow integration tests for PulseQuery client.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Verifies user registration, OAuth2 password login, and authenticated profile retrieval.
 */
class AuthApiE2ETest {

    /**
     * Verifies that user registration, credential login, and `/api/v1/auth/me` verification succeed cleanly.
     */
    @Test
    fun testLoginAndFetchMe() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        AppContainer.setHttpClientForTest(createMockClient())

        val email = "test_e2e_${io.ktor.util.date.getTimeMillis()}@example.com"
        val password = "StrongPassword123!"

        val registerResponse = AppContainer.authApi.registerUserApiV1AuthRegisterPost(
            UserCreate(email = email, password = password)
        )
        assertTrue(registerResponse.success, "Registration failed: ${registerResponse.status}")

        val loginResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
            username = email,
            password = password,
            grantType = "password"
        )
        assertTrue(loginResponse.success, "Login failed: ${loginResponse.status}")

        val token = loginResponse.body().accessToken
        assertNotNull(token)
        AppContainer.currentToken = token

        val meResponse = AppContainer.authApi.readUsersMeApiV1AuthMeGet()
        assertTrue(meResponse.success, "Fetch Me failed: ${meResponse.status}")
        assertEquals("test@test.com", meResponse.body().email)
        AppContainer.resetForTest()
    }
}
