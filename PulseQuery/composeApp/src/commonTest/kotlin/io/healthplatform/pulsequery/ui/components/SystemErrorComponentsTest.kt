package io.healthplatform.pulsequery.ui.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.testing.BaseComposeTest
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Unit tests verifying UI states, interactions, and text rendering in SystemErrorComponents.
 */
class SystemErrorComponentsTest : BaseComposeTest() {

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testBackendOfflineBannerRendersAndHandlesRetry() = runComposeUiTest {
        var retryClicked = false

        setContent {
            MaterialTheme {
                BackendOfflineBanner(
                    onRetry = { retryClicked = true },
                    isRetrying = false
                )
            }
        }

        onNodeWithText("Backend Inaccessible").assertIsDisplayed()
        onNodeWithText("Retry").assertIsDisplayed().performClick()
        assertTrue(retryClicked)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testDatabaseErrorCardRendersAndHandlesRetry() = runComposeUiTest {
        var queryRetried = false

        setContent {
            MaterialTheme {
                DatabaseErrorCard(
                    title = "Database Connection Lost",
                    message = "PostgreSQL is unreachable at localhost:5432.",
                    onRetry = { queryRetried = true }
                )
            }
        }

        onNodeWithText("Database Connection Lost").assertIsDisplayed()
        onNodeWithText("PostgreSQL is unreachable at localhost:5432.").assertIsDisplayed()
        onNodeWithText("Retry Query").assertIsDisplayed().performClick()
        assertTrue(queryRetried)
    }
}
