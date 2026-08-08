package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.createMockClient
import kotlin.test.BeforeTest
import kotlin.test.Test

class RegisterScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.currentBaseUrl = "http://localhost"
        AppContainer.setHttpClientForTest(createMockClient())
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testRegisterScreen() = runComposeUiTest {
        setContent {
            MaterialTheme {
                LoginScreen(onLoginSuccess = {})
            }
        }
    }
}
