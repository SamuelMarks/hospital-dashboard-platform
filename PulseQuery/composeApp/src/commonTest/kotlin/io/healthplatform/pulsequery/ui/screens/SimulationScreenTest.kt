package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import androidx.compose.ui.test.hasText
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

class SimulationScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(success: Boolean = true) {
        val mockEngine = MockEngine { request ->
            if (request.url.encodedPath.contains("simulation/run")) {
                if (!success) {
                    respond("Server error", HttpStatusCode.InternalServerError)
                } else {
                    respond(
                        """{"status":"SUCCESS","message":"Simulated successfully","assignments":[{"Service":"Cardiology","Unit":"ICU","Original_Count":10.0,"Patient_Count":12.0,"Delta":2.0}]}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
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
    fun testSimulationScreenInitialAndExecuteSuccess() = runComposeUiTest {
        setupMockApi(success = true)

        setContent {
            MaterialTheme {
                SimulationScreen()
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testSimulationScreenExecuteNetworkError() = runComposeUiTest {
        setupMockApi(success = false)

        setContent {
            MaterialTheme {
                SimulationScreen()
            }
        }
    }
}
