package io.healthplatform.pulsequery.di

import io.healthplatform.pulsequery.api.models.UserResponse
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AppContainerTest {

    @BeforeTest
    fun setUp() {
        AppContainer.logout()
    }

    @AfterTest
    fun tearDown() {
        AppContainer.logout()
        AppContainer.currentBaseUrl = "http://localhost:8080"
    }

    @Test
    fun testAuthAndLogout() {
        assertNull(AppContainer.currentToken)
        assertNull(AppContainer.currentUser)

        AppContainer.currentToken = "test-token"
        val testUser = UserResponse(
            id = "1",
            email = "test@example.com",
            isActive = true,
            isAdmin = true
        )
        AppContainer.currentUser = testUser

        assertEquals("test-token", AppContainer.currentToken)
        assertEquals(testUser, AppContainer.currentUser)

        AppContainer.logout()

        assertNull(AppContainer.currentToken)
        assertNull(AppContainer.currentUser)
    }

    @Test
    fun testBaseUrlUpdateRecreatesClients() {
        val initialAuthApi = AppContainer.authApi
        assertNotNull(initialAuthApi)

        AppContainer.currentBaseUrl = "https://example.com/api"

        val updatedAuthApi = AppContainer.authApi
        // Since we changed baseUrl, it should be a new instance and the client re-initialized
        assertTrue(initialAuthApi !== updatedAuthApi)
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

        val simulation = AppContainer.simulationApi
        assertNotNull(simulation)
        assertEquals(simulation, AppContainer.simulationApi)

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
}
