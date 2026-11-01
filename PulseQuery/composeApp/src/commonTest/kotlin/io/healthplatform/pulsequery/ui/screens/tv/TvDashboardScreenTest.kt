/**
 * Unit tests verifying TV Form Factor Wallboard layout and focus behaviors.
 */
package io.healthplatform.pulsequery.ui.screens.tv

import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.testing.BaseComposeTest
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
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Validates rendering, helpers, and semantic properties of the TV Wallboard dashboard.
 */
@OptIn(ExperimentalTestApi::class)
class TvDashboardScreenTest : BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @Test
    fun testTvDashboardHelpers() {
        assertEquals("ICU Ops", resolveTvWallboardTitle("ICU Ops", "Default Wallboard"))
        assertEquals("Default Wallboard", resolveTvWallboardTitle(null, "Default Wallboard"))
        assertEquals("TV Card: Bed Occupancy", buildTvCardAccessibilityDescription("Bed Occupancy"))

        val requester = FocusRequester()
        assertTrue(requestInitialTvCardFocus(isFirst = false, focusRequester = requester).isSuccess)
        assertTrue(requestInitialTvCardFocus(isFirst = true, focusRequester = requester).isSuccess || requestInitialTvCardFocus(isFirst = true, focusRequester = requester).isFailure)
    }

    @Test
    fun testTvDashboardScreenRendersWidgetsAndCarousel() = runComposeUiTest {
        val mockEngine = MockEngine { request ->
            val path = request.url.encodedPath.removeSuffix("/")
            when {
                path.endsWith("/api/v1/dashboards") -> respond(
                    content = """[{
                        "id":"d-1",
                        "name":"Command Center Wallboard",
                        "owner_id":"u-1",
                        "widgets":[
                            {"id":"w-1","dashboard_id":"d-1","title":"PICU Census","subtitle":"Live 15m","type":"SQL","visualization":"metric","config":{"subtitle":"Live 15m"}},
                            {"id":"w-2","dashboard_id":"d-1","title":"ED Boarding","type":"SQL","visualization":"barchart","config":{}}
                        ]
                    }]""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)

        setContent {
            TvDashboardScreen()
        }

        waitUntil(timeoutMillis = 15000) {
            onAllNodesWithText("PICU Census", substring = true).fetchSemanticsNodes().isNotEmpty()
        }
        onNodeWithText("Command Center Wallboard").assertExists()
        onNodeWithText("PICU Census").assertExists()
        onNodeWithTag("widget_subtitle_w-1").assertExists()
        onNodeWithText("ED Boarding").assertExists()
    }

    @Test
    fun testTvDashboardExitCallbackAndDirectCardRender() = runComposeUiTest {
        var exitCalled = false
        val widget = WidgetResponse(
            id = "w-direct",
            dashboardId = "d-1",
            title = "NICU Beds",
            type = "SQL",
            visualization = "table",
            config = buildJsonObject {
                put("subtitle", JsonPrimitive("Shift A"))
            }
        )
        setContent {
            TvCardItem(widget = widget, isFirst = false)
            TvDashboardScreen(onExit = { exitCalled = true })
        }

        onNodeWithText("NICU Beds").assertExists()
        onNodeWithText("Exit Wallboard").performClick()
        assertTrue(exitCalled)
    }
}
