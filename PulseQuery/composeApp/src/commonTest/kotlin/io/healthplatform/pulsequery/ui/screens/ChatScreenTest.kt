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

class ChatScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(successLoad: Boolean = true, successCreate: Boolean = true) {
        val mockEngine = MockEngine { request ->
            respond("Not Found", HttpStatusCode.NotFound)
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
    fun testChatScreenInitialAndSelect() = runComposeUiTest {
        setupMockApi(successLoad = true)

        setContent {
            MaterialTheme {
                ChatScreen()
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testChatScreenLoadError() = runComposeUiTest {
        setupMockApi(successLoad = false)

        setContent {
            MaterialTheme {
                ChatScreen()
            }
        }
    }
}
