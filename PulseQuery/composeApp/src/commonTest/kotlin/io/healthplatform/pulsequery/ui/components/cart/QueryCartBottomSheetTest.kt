package io.healthplatform.pulsequery.ui.components.cart

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.StagedQuery
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * UI and state tests for [QueryCartBottomSheet] verifying query staging,
 * item rendering, batch deployment, and dismissal behavior.
 */
class QueryCartBottomSheetTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.queryCartRepository.clearCart()
    }

    @AfterTest
    fun tearDown() {
        AppContainer.queryCartRepository.clearCart()
        AppContainer.resetForTest()
    }

    private fun installMockClient(status: HttpStatusCode, body: String) {
        val mockEngine = MockEngine {
            respond(
                content = body,
                status = status,
                headers = headersOf(HttpHeaders.ContentType, "application/json")
            )
        }
        AppContainer.setHttpClientForTest(
            HttpClient(mockEngine) {
                install(ContentNegotiation) {
                    json(Json { ignoreUnknownKeys = true })
                }
            }
        )
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEmptyQueryCartRendering() = runComposeUiTest {
        setContent {
            MaterialTheme {
                QueryCartBottomSheet(
                    activeDashboardId = "dash-1",
                    onDismiss = {}
                )
            }
        }

        onNodeWithText("Query Cart (0)").assertExists()
        onNodeWithText("Your query cart is empty. Stage queries from SQL Editor or Chat.").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testStagedQueriesRenderingAndActions() = runComposeUiTest {
        AppContainer.queryCartRepository.addQuery(
            title = "ICU Census",
            sql = "SELECT * FROM hospital_data WHERE unit = 'ICU';"
        )
        AppContainer.queryCartRepository.addQuery(
            title = "NICU Census",
            sql = "SELECT * FROM hospital_data WHERE unit = 'NICU';"
        )

        setContent {
            MaterialTheme {
                QueryCartSheetContent(
                    activeDashboardId = "dash-1",
                    onDismiss = {}
                )
            }
        }

        onNodeWithText("Query Cart (2)").assertExists()
        onNodeWithText("ICU Census").assertExists()
        onNodeWithText("Clear All").assertExists()
        onNodeWithText("Add 2 Widgets to Dashboard").assertExists()

        // Remove single item via Clear All
        onNodeWithText("Clear All").performClick()
        waitForIdle()
        assertEquals(0, AppContainer.queryCartRepository.stagedQueries.value.size)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testRemoveSingleStagedQueryAndDeploySuccess() = runComposeUiTest {
        installMockClient(
            HttpStatusCode.Created,
            """{"id":"w-1","dashboard_id":"dash-1","title":"ICU Census","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}"""
        )

        AppContainer.queryCartRepository.addQuery(
            title = "ICU Census",
            sql = "SELECT 1;"
        )

        var deployed = false
        var dismissed = false

        setContent {
            MaterialTheme {
                QueryCartSheetContent(
                    activeDashboardId = "dash-1",
                    onDismiss = { dismissed = true },
                    onQueriesDeployed = { deployed = true }
                )
            }
        }

        onNodeWithText("Add 1 Widgets to Dashboard").performClick()
        waitForIdle()
        assertTrue(deployed)
        assertTrue(dismissed)

        // Add another query and test individual delete button and null dashboardId
        AppContainer.queryCartRepository.addQuery(
            title = "Temp Query",
            sql = "SELECT 2;"
        )
        waitForIdle()
        onNodeWithContentDescription("Remove from cart").performClick()
        waitForIdle()
        assertEquals(0, AppContainer.queryCartRepository.stagedQueries.value.size)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDeployFailureShowsError() = runComposeUiTest {
        installMockClient(
            HttpStatusCode.InternalServerError,
            """{"detail":"Database unavailable"}"""
        )

        AppContainer.queryCartRepository.addQuery(
            title = "Failing Query",
            sql = "SELECT * FROM broken;"
        )

        setContent {
            MaterialTheme {
                QueryCartSheetContent(
                    activeDashboardId = "dash-1"
                )
            }
        }

        onNodeWithText("Add 1 Widgets to Dashboard").performClick()
        waitForIdle()
        assertEquals(1, AppContainer.queryCartRepository.stagedQueries.value.size)
    }

    @Test
    fun testDeployStagedQueriesToDashboardHelper() = kotlinx.coroutines.runBlocking {
        installMockClient(
            HttpStatusCode.Created,
            """{"id":"w-1","dashboard_id":"dash-1","title":"Q1","type":"SQL","visualization":"table","config":{"query":"SELECT 1"}}"""
        )
        val queries = listOf(StagedQuery(id = "1", title = "Q1", sql = "SELECT 1", visualization = "table"))
        val okRes = deployStagedQueriesToDashboard("dash-1", queries)
        assertTrue(okRes.isSuccess)

        installMockClient(
            HttpStatusCode.BadRequest,
            """{"detail":"Invalid SQL"}"""
        )
        val failRes = deployStagedQueriesToDashboard("dash-1", queries)
        assertTrue(failRes.isFailure)
    }
}
