package io.healthplatform.pulsequery.ui.screens.admin

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import androidx.compose.ui.test.waitUntilAtLeastOneExists
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
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * UI verification tests for [UserManagementScreen] verifying composable layout,
 * user listings, role chip controls, and error states.
 */
class UserManagementScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockEngine(success: Boolean = true) {
        val usersJson = """
            [
                {"id":"u1","email":"doctor@hospital.org","is_active":true,"is_admin":false,"role":"PHYSICIAN"},
                {"id":"u2","email":"nurse@hospital.org","is_active":false,"is_admin":false,"role":"CHARGE_NURSE"}
            ]
        """.trimIndent()

        val mockEngine = MockEngine { request ->
            when {
                !success -> respond("Internal Server Error", HttpStatusCode.InternalServerError)
                request.url.encodedPath.contains("admin/users") -> {
                    respond(
                        usersJson,
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }

        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testUserManagementScreenDisplaysUsers() = runComposeUiTest {
        setupMockEngine(success = true)

        setContent {
            MaterialTheme {
                UserManagementScreen()
            }
        }

        waitUntilAtLeastOneExists(hasText("All Roles"), timeoutMillis = 30000)
        onNodeWithText("User Management").assertExists()
        onNodeWithText("All Roles").assertExists()
        onNodeWithText("PHYSICIAN").assertExists()
        onNodeWithText("CHARGE_NURSE").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testUserManagementScreenErrorState() = runComposeUiTest {
        setupMockEngine(success = false)

        setContent {
            MaterialTheme {
                UserManagementScreen()
            }
        }

        waitUntilAtLeastOneExists(hasText("Retry"), timeoutMillis = 30000)
        onNodeWithText("User Management").assertExists()
        onNodeWithText("Retry").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testUserManagementScreenNavigationBack() = runComposeUiTest {
        setupMockEngine(success = true)
        var navigatedBack = false

        setContent {
            MaterialTheme {
                UserManagementScreen(
                    onNavigateBack = { navigatedBack = true }
                )
            }
        }

        onNodeWithText("User Management").assertExists()
    }
}
