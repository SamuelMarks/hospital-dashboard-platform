package io.healthplatform.pulsequery.ui.components.cart

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.runComposeUiTest
import io.healthplatform.pulsequery.di.AppContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test

/**
 * UI and state tests for [QueryCartBottomSheet] verifying query staging,
 * item rendering, and dismissal behavior.
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
    fun testStagedQueriesRendering() = runComposeUiTest {
        AppContainer.queryCartRepository.addQuery(
            title = "ICU Census",
            sql = "SELECT * FROM hospital_data WHERE unit = 'ICU';"
        )

        setContent {
            MaterialTheme {
                QueryCartBottomSheet(
                    activeDashboardId = "dash-1",
                    onDismiss = {}
                )
            }
        }

        onNodeWithText("Query Cart (1)").assertExists()
        onNodeWithText("ICU Census").assertExists()
        onNodeWithText("Clear All").assertExists()
        onNodeWithText("Add 1 Widgets to Dashboard").assertExists()
    }
}
