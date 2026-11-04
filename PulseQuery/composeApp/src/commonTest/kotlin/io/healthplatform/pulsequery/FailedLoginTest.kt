/**
 * Unit tests verifying failed authentication handling via the [Result] railway API.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.core.result.asResultMap
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Unit test verifying error handling behavior when attempting login with invalid user credentials.
 */
class FailedLoginTest {

    /**
     * Verifies that authentication fails safely and returns a failure [Result] when provided
     * incorrect user credentials against the mock network client.
     */
    @Test
    fun testFailedLogin() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        AppContainer.setHttpClientForTest(createMockClient())

        val loginResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
            username = "nonexistent@example.com",
            password = "wrongpassword",
            grantType = "password"
        )
        val result = loginResponse.asResultMap { it.accessToken }

        assertTrue(result.isFailure, "Expected login with wrong credentials to fail")
        assertNotNull(result.exceptionOrNull())
    }
}
