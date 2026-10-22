/**
 * End-to-end multi-feature workflow test verifying authentication, dashboards, analytics,
 * conversational AI, templates, and schema discovery against the mock HTTP client.
 */
package io.healthplatform.pulsequery

import io.healthplatform.pulsequery.api.models.ConversationCreate
import io.healthplatform.pulsequery.api.models.MessageCreate
import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Validates the complete clinician user journey across all primary backend API services.
 */
class AppE2EWorkflowsTest {

    /**
     * Exercises registration, login, profile lookup, dashboard listing, LLM analytics,
     * conversation creation, message sending, template browsing, and schema inspection.
     */
    @Test
    fun testAllCommonWorkflows() = runTest {
        AppContainer.currentBaseUrl = "http://localhost:8000"
        AppContainer.setHttpClientForTest(createMockClient())

        val email = "e2e_${io.ktor.util.date.getTimeMillis()}@example.com"
        val password = "StrongPassword123!"

        val registerResponse = AppContainer.authApi.registerUserApiV1AuthRegisterPost(
            UserCreate(email = email, password = password)
        )
        assertTrue(registerResponse.success, "Registration failed")

        val loginResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
            username = email,
            password = password,
            grantType = "password"
        )
        assertTrue(loginResponse.success, "Login failed")
        AppContainer.currentToken = loginResponse.body().accessToken

        val meResponse = AppContainer.authApi.readUsersMeApiV1AuthMeGet()
        assertTrue(meResponse.success, "Fetch Me failed")
        assertNotNull(meResponse.body().id)

        val dashResponse = AppContainer.dashboardsApi.listDashboardsApiV1DashboardsGet()
        assertTrue(dashResponse.success, "Dashboards failed")
        assertTrue(dashResponse.body().isNotEmpty(), "Expected seeded mock dashboards")

        val analyticsResponse = AppContainer.analyticsApi.listLlmOutputsApiV1AnalyticsLlmGet()
        assertTrue(analyticsResponse.success, "Analytics failed")
        assertTrue(analyticsResponse.body().isNotEmpty(), "Expected analytics records")

        val convResponse = AppContainer.chatApi.createConversationApiV1ConversationsPost(
            ConversationCreate(title = "Test E2E")
        )
        assertTrue(convResponse.success, "Conversation create failed")
        val convId = convResponse.body().id

        val msgResponse = AppContainer.chatApi.sendMessageApiV1ConversationsConversationIdMessagesPost(
            conversationId = convId,
            messageCreate = MessageCreate(content = "Hello AI")
        )
        assertTrue(msgResponse.success, "Send Message failed")
        assertEquals("user", msgResponse.body().role)

        val templatesResponse = AppContainer.templatesApi.listTemplatesApiV1TemplatesGet()
        assertTrue(templatesResponse.success, "Templates failed")
        assertTrue(templatesResponse.body().isNotEmpty(), "Expected widget templates")

        val schemaResponse = AppContainer.schemaApi.getDatabaseSchemaApiV1SchemaGet()
        assertTrue(schemaResponse.success, "Schema failed")
        assertTrue(schemaResponse.body().isNotEmpty(), "Expected database schema tables")
        AppContainer.resetForTest()
    }
}
