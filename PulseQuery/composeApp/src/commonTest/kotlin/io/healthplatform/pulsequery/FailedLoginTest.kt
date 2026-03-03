package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test

class FailedLoginTest {
    @Test
    fun testFailedLogin() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        AppContainer.setHttpClientForTest(createMockClient())
        
        var didThrow = false
        try {
            val loginResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
                username = "nonexistent@example.com",
                password = "wrongpassword",
                grantType = "password"
            )
            val token = loginResponse.body().accessToken
            println("Token: $token")
        } catch (e: Exception) {
            println("EXCEPTION THROWN: ${e::class.simpleName}: ${e.message}")
            didThrow = true
        }
        
        if (!didThrow) {
            throw AssertionError("Expected login with wrong credentials to throw an exception")
        }
    }
}
