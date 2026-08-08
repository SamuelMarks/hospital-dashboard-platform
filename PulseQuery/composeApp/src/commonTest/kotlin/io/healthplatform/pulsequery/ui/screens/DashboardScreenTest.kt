package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.runComposeUiTest
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

class DashboardScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(successLoad: Boolean = true) {
        val mockEngine = MockEngine { request ->
            if (request.url.encodedPath.contains("dashboards")) {
                if (successLoad) {
                    respond(
                        """[{"id":"1","name":"Main","owner_id":"1","widgets":[{"id":"1","title":"test","type":"TABLE","sql_query":"SELECT 1"}]}]""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                } else {
                    respond("Server error", HttpStatusCode.InternalServerError)
                }
            } else {
                respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardScreenInitial() = runComposeUiTest {
        setupMockApi(successLoad = true)

        setContent {
            MaterialTheme {
                DashboardScreen()
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDashboardScreenLoadError() = runComposeUiTest {
        setupMockApi(successLoad = false)

        setContent {
            MaterialTheme {
                DashboardScreen()
            }
        }
    }
}
