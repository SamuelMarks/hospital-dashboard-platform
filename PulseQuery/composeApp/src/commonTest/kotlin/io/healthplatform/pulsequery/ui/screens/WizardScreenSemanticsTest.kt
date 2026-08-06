package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.printToLog
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.wizard.WizardScreen
import io.healthplatform.pulsequery.ui.screens.wizard.WizardUseCase
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

class WizardScreenSemanticsTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
        val mockEngine = MockEngine { request ->
            respond("{}", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
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
    fun testWizardScreenUseCaseCardsSemantics() = runComposeUiTest {
        setContent {
            MaterialTheme {
                WizardScreen()
            }
        }

        // Wait for screen to render
        onNodeWithText("What would you like to optimize today?").assertExists()
        
        // Verify all Use Cases have click actions and are enabled
        WizardUseCase.values().forEach { useCase ->
            onNodeWithText(useCase.title)
                .assertExists()
                .assertHasClickAction()
                .assertIsEnabled()
        }
    }
}
