package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertNotNull

class AuthApiE2ETest {
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

        // Login
        try {
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
            
        } catch (e: Exception) {
            println("EXCEPTION CAUGHT: ${e.message}")
            throw e
        }
    }
}
