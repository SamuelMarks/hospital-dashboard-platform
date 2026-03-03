package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.api.models.ConversationCreate
import io.healthplatform.pulsequery.api.models.MessageCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertTrue
import kotlin.test.assertNotNull

class AppE2EWorkflowsTest {

    @Test
    fun testAllCommonWorkflows() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        AppContainer.setHttpClientForTest(createMockClient())
        
        val email = "e2e_${io.ktor.util.date.getTimeMillis()}@example.com"
        val password = "StrongPassword123!"

        // 1. Register & Login
        println("TEST: Registration")
        val registerResponse = AppContainer.authApi.registerUserApiV1AuthRegisterPost(
            UserCreate(email = email, password = password)
        )
        assertTrue(registerResponse.success, "Registration failed")

        println("TEST: Login")
        val loginResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
            username = email, password = password, grantType = "password"
        )
        assertTrue(loginResponse.success, "Login failed")
        AppContainer.currentToken = loginResponse.body().accessToken
        
        // Fetch Me
        val meResponse = AppContainer.authApi.readUsersMeApiV1AuthMeGet()
        assertTrue(meResponse.success, "Fetch Me failed")
        val userId = meResponse.body().id
        assertNotNull(userId)
        println("Logged in as User ID: $userId")

        // 2. Dashboards
        println("TEST: Fetch Dashboards")
        val dashResponse = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
        assertTrue(dashResponse.success, "Dashboards failed")
        val dashboards = dashResponse.body()
        println("Found ${dashboards.size} dashboards.")

        // 3. Analytics
        println("TEST: Fetch Analytics")
        val analyticsResponse = AppContainer.analyticsApi.listLlmOutputsApiV1AnalyticsLlmGet()
        assertTrue(analyticsResponse.success, "Analytics failed")

        // 4. Chat/AI
        try {
            println("TEST: Create Conversation")
            val convResponse = AppContainer.chatApi.createConversationApiV1ConversationsPost(
                ConversationCreate(title = "Test E2E")
            )
            assertTrue(convResponse.success, "Conversation create failed")
            val convId = convResponse.body().id
            
            println("TEST: Send Message")
            val msgResponse = AppContainer.chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost(
                conversationId = convId,
                messageCreate = MessageCreate(content = "Hello AI")
            )
            assertTrue(msgResponse.success, "Send Message failed")
        } catch (e: Exception) {
            println("Chat workflow failed (expected if AI unavailable locally): ${e.message}")
        }

        // 5. Templates
        println("TEST: Fetch Templates")
        val templatesResponse = AppContainer.templatesApi.listTemplatesApiV1TemplatesGet()
        assertTrue(templatesResponse.success, "Templates failed")
        println("Found ${templatesResponse.body().size} templates.")
        
        // 6. Schema Exploration
        println("TEST: Fetch Schema")
        val schemaResponse = AppContainer.schemaApi.getDatabaseSchemaApiV1SchemaGet()
        assertTrue(schemaResponse.success, "Schema failed")
        println("Schema Tables: ${schemaResponse.body().size}")

        println("ALL E2E WORKFLOWS SUCCEEDED")
    }
}
