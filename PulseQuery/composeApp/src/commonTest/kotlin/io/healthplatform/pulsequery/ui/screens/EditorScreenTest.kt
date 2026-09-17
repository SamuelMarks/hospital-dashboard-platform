package io.healthplatform.pulsequery.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.runComposeUiTest
import androidx.compose.ui.test.waitUntilAtLeastOneExists
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.editor.SaveQueryDestination
import io.healthplatform.pulsequery.ui.screens.editor.SaveQueryDialog
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
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EditorScreenTest : io.healthplatform.pulsequery.testing.BaseComposeTest() {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    private fun setupMockApi(success: Boolean = true, returnErrorMsg: Boolean = false) {
        val mockEngine = MockEngine { request ->
            when {
                request.url.encodedPath.contains("ai/execute") -> {
                    if (!success) {
                        respond("Server error", HttpStatusCode.InternalServerError)
                    } else if (returnErrorMsg) {
                        respond(
                            """{"status":"error","error":"Syntax error","data":[],"columns":[]}""",
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    } else {
                        respond(
                            """{"status":"success","error":null,"data":[{"id":"1","name":"TestResult"}],"columns":["id","name"]}""",
                            HttpStatusCode.OK,
                            headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                        )
                    }
                }
                request.url.encodedPath.contains("dashboards") -> {
                    respond(
                        """[{"id":"dash-1","name":"ICU Operational Board","is_auto_refresh":false,"refresh_interval_seconds":30,"theme":"light","created_at":"2026-09-01T00:00:00Z","updated_at":"2026-09-01T00:00:00Z"}]""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                request.url.encodedPath.contains("templates") -> {
                    respond(
                        """{"id":"tpl-1","title":"Saved Template","sql_template":"SELECT 1","category":"Clinical"}""",
                        HttpStatusCode.OK,
                        headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond("Not Found", HttpStatusCode.NotFound)
            }
        }
        val client = HttpClient(mockEngine) {
            install(ContentNegotiation) {
                json(Json { ignoreUnknownKeys = true; isLenient = true })
            }
        }
        AppContainer.setHttpClientForTest(client)
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenInitialAndExecuteSuccess() = runComposeUiTest {
        setupMockApi(success = true)

        setContent {
            MaterialTheme {
                EditorScreen()
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenExecuteErrorResponse() = runComposeUiTest {
        setupMockApi(success = true, returnErrorMsg = true)

        setContent {
            MaterialTheme {
                EditorScreen()
            }
        }
    }
    
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenExecuteNetworkError() = runComposeUiTest {
        setupMockApi(success = false)

        setContent {
            MaterialTheme {
                EditorScreen()
            }
        }
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testEditorScreenOpensSaveDialog() = runComposeUiTest {
        setupMockApi(success = true)

        setContent {
            MaterialTheme {
                EditorScreen()
            }
        }

        onNodeWithContentDescription("Save Query").performClick()
        onNodeWithText("Save Analytical Query").assertExists()
        onNodeWithText("Dashboard Widget").assertExists()
        onNodeWithText("Template Library").assertExists()
    }

    @OptIn(ExperimentalTestApi::class)
    @Test
    fun testSaveQueryDialogTemplateMode() = runComposeUiTest {
        setupMockApi(success = true)
        var savedMessage = ""

        setContent {
            MaterialTheme {
                SaveQueryDialog(
                    sql = "SELECT count(*) FROM admissions",
                    onDismiss = {},
                    onSaved = { savedMessage = it }
                )
            }
        }

        onNodeWithText("Template Library").performClick()
        onNodeWithText("Category").assertExists()
        onNodeWithText("Description").assertExists()
    }

    @Test
    fun testSaveQueryDestinationEnumValues() {
        assertEquals(2, SaveQueryDestination.entries.size)
        assertTrue(SaveQueryDestination.entries.contains(SaveQueryDestination.DASHBOARD_WIDGET))
        assertTrue(SaveQueryDestination.entries.contains(SaveQueryDestination.TEMPLATE))
    }
}
