/**
 * Unit tests verifying [AppContainer] dependency registry, base URL hot-reloading, and token refresh flows.
 */
package io.healthplatform.pulsequery.di

import io.healthplatform.pulsequery.api.models.UserResponse
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.serialization.kotlinx.json.json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNotSame
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Test suite for [AppContainer] service registry and session management.
 */
class AppContainerTest {

    /** Resets session state before each test. */
    @BeforeTest
    fun setUp() {
        AppContainer.logout()
    }

    /** Restores default base URL and logs out after each test. */
    @AfterTest
    fun tearDown() {
        AppContainer.logout()
        AppContainer.currentBaseUrl = "http://localhost:8080"
    }

    /** Verifies token and user state mutations, [AuthSessionState.isAuthenticated], and logout cleanup. */
    @Test
    fun testAuthAndLogout() {
        assertNull(AppContainer.currentToken)
        assertNull(AppContainer.currentUser)
        kotlin.test.assertFalse(AppContainer.sessionState.value.isAuthenticated)
        assertTrue(AuthSessionState(accessToken = "   ").isAuthenticated.not())

        AppContainer.currentToken = "test-token"
        AppContainer.refreshToken = "in-mem-refresh"
        assertEquals("in-mem-refresh", AppContainer.refreshToken)
        AppContainer.refreshToken = null
        assertNull(AppContainer.refreshToken)
        assertTrue(AppContainer.sessionState.value.isAuthenticated)
        val testUser = UserResponse(
            id = "1",
            email = "test@example.com",
            isActive = true,
            isAdmin = true,
            languagePreference = "en"
        )
        AppContainer.currentUser = testUser

        assertEquals("test-token", AppContainer.currentToken)
        assertEquals(testUser, AppContainer.currentUser)
        assertEquals(testUser, AppContainer.sessionState.value.user)

        val copiedState = AppContainer.sessionState.value.copy(refreshToken = "r-tok")
        assertEquals("r-tok", copiedState.refreshToken)

        val storage = io.healthplatform.pulsequery.database.KeyValueStorage()
        AppContainer.keyValueStorage = storage
        AppContainer.currentToken = "stored-access"
        AppContainer.refreshToken = "stored-refresh"
        AppContainer.currentToken = null
        AppContainer.refreshToken = null
        assertNull(storage.get(AppContainer.KEY_AUTH_TOKEN))
        assertNull(storage.get(AppContainer.KEY_REFRESH_TOKEN))

        AppContainer.logout()

        assertNull(AppContainer.currentToken)
        assertNull(AppContainer.currentUser)
        kotlin.test.assertFalse(AppContainer.sessionState.value.isAuthenticated)
    }

    /** Verifies updating [AppContainer.currentBaseUrl] recreates distinct API service instances. */
    @Test
    fun testBaseUrlUpdateRecreatesClients() {
        val initialAuthApi = AppContainer.authApi
        val initialDashboardsApi = AppContainer.dashboardsApi
        val initialChatApi = AppContainer.chatApi
        val initialOptApi = AppContainer.optimizationApi
        assertNotNull(initialAuthApi)

        AppContainer.currentBaseUrl = "https://example.com/api"

        assertNotSame(initialAuthApi, AppContainer.authApi)
        assertNotSame(initialDashboardsApi, AppContainer.dashboardsApi)
        assertNotSame(initialChatApi, AppContainer.chatApi)
        assertNotSame(initialOptApi, AppContainer.optimizationApi)
        assertSame(AppContainer.dashboardsApi, AppContainer.dashboardsApi)
    }

    @Test
    fun testLazyInitialization() {
        val client = AppContainer.httpClient
        assertNotNull(client)
        val client2 = AppContainer.httpClient // Hit branch `if (_httpClient == null)` when false
        assertEquals(client, client2)

        val dashboards = AppContainer.dashboardsApi
        assertNotNull(dashboards)
        assertEquals(dashboards, AppContainer.dashboardsApi)

        val chat = AppContainer.chatApi
        assertNotNull(chat)
        assertEquals(chat, AppContainer.chatApi)

        val analytics = AppContainer.analyticsApi
        assertNotNull(analytics)
        assertEquals(analytics, AppContainer.analyticsApi)

        val optimization = AppContainer.optimizationApi
        assertNotNull(optimization)
        assertEquals(optimization, AppContainer.optimizationApi)

        val admin = AppContainer.adminApi
        assertNotNull(admin)
        assertEquals(admin, AppContainer.adminApi)

        val ai = AppContainer.aiApi
        assertNotNull(ai)
        assertEquals(ai, AppContainer.aiApi)

        val schema = AppContainer.schemaApi
        assertNotNull(schema)
        assertEquals(schema, AppContainer.schemaApi)

        val templates = AppContainer.templatesApi
        assertNotNull(templates)
        assertEquals(templates, AppContainer.templatesApi)

        val execution = AppContainer.executionApi
        assertNotNull(execution)
        assertEquals(execution, AppContainer.executionApi)

        val system = AppContainer.systemApi
        assertNotNull(system)
        assertEquals(system, AppContainer.systemApi)

        val benchmarks = AppContainer.benchmarksApi
        assertNotNull(benchmarks)
        assertEquals(benchmarks, AppContainer.benchmarksApi)

        val liteRt = AppContainer.liteRtModelManager
        assertNotNull(liteRt)
        assertEquals(liteRt, AppContainer.liteRtModelManager)

        val alertRules = AppContainer.alertRulesApi
        assertNotNull(alertRules)
        assertEquals(alertRules, AppContainer.alertRulesApi)

        val healthRepo = AppContainer.networkHealthRepository
        assertNotNull(healthRepo)
        assertEquals(healthRepo, AppContainer.networkHealthRepository)

        val adminUsers = AppContainer.adminUsersApi
        assertNotNull(adminUsers)
        assertEquals(adminUsers, AppContainer.adminUsersApi)

        val wsRepo = AppContainer.dashboardWebSocketRepository
        assertNotNull(wsRepo)
        assertEquals(wsRepo, AppContainer.dashboardWebSocketRepository)

        val chatStreaming = AppContainer.chatStreamingRepository
        assertNotNull(chatStreaming)
        assertEquals(chatStreaming, AppContainer.chatStreamingRepository)
    }

    @Test
    fun testSetHttpClientForTest() {
        val mockClient = HttpClient(MockEngine) {
            engine {
                addHandler { request ->
                    respond("OK")
                }
            }
        }
        AppContainer.currentBaseUrl = "http://localhost:8080" // Clear state
        AppContainer.setHttpClientForTest(mockClient)

        assertEquals(mockClient, AppContainer.httpClient)
    }

    @Test
    fun testRefreshSessionNoToken() = kotlinx.coroutines.test.runTest {
        AppContainer.refreshToken = null
        val result = AppContainer.refreshSession()
        kotlin.test.assertTrue(result.isFailure)
    }

    @Test
    fun testRefreshSessionSuccess() = kotlinx.coroutines.test.runTest {
        val mockClient = HttpClient(MockEngine) {
            engine {
                addHandler { request ->
                    respond(
                        content = """{"access_token":"new-access-token","token_type":"bearer","refresh_token":"new-refresh-token"}""",
                        status = io.ktor.http.HttpStatusCode.OK,
                        headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json")
                    )
                }
            }
            install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) {
                json(kotlinx.serialization.json.Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(mockClient)
        AppContainer.refreshToken = "initial-refresh"

        val result = AppContainer.refreshSession()
        kotlin.test.assertTrue(result.isSuccess)
        assertEquals("new-access-token", AppContainer.currentToken)
        assertEquals("new-refresh-token", AppContainer.refreshToken)
    }

    @Test
    fun testRefreshSessionWithoutRefreshTokenInResponse() = kotlinx.coroutines.test.runTest {
        val mockClient = HttpClient(MockEngine) {
            engine {
                addHandler { request ->
                    respond(
                        content = """{"access_token":"token-only","token_type":"bearer"}""",
                        status = io.ktor.http.HttpStatusCode.OK,
                        headers = io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json")
                    )
                }
            }
            install(io.ktor.client.plugins.contentnegotiation.ContentNegotiation) {
                json(kotlinx.serialization.json.Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(mockClient)
        AppContainer.refreshToken = "initial-refresh"

        val result = AppContainer.refreshSession()
        kotlin.test.assertTrue(result.isSuccess)
        assertEquals("token-only", AppContainer.currentToken)
        assertEquals("initial-refresh", AppContainer.refreshToken)

        val failingDriverFactory = object : io.healthplatform.pulsequery.database.DatabaseDriverFactory {
            override fun createDriver(): app.cash.sqldelight.db.SqlDriver {
                throw IllegalStateException("Driver init failed")
            }
        }
        val dbFailResult = AppContainer.initDatabase(failingDriverFactory)
        kotlin.test.assertTrue(dbFailResult.isFailure)
    }
}
