package io.healthplatform.pulsequery.ui.screens.editor

import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.QueryCartRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [EditorViewModel] and [EditorUiState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class EditorViewModelTest {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    private fun createClient(engine: MockEngine): HttpClient = HttpClient(engine) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true; isLenient = true })
        }
    }

    @Test
    fun testEditorUiStateProperties() {
        val state = EditorUiState(sqlQuery = "SELECT 1", result = null, isLoading = false, errorMessage = "err")
        assertEquals("SELECT 1", state.sqlQuery)
        assertNull(state.result)
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
    }

    @Test
    fun testUpdateSqlQueryAndStageToCart() = kotlinx.coroutines.runBlocking {
        val cart = QueryCartRepository()
        val vm = EditorViewModel(scope = this, queryCartRepository = cart)

        vm.updateSqlQuery("   ")
        assertEquals("   ", vm.state.value.sqlQuery)
        vm.stageToCart()
        assertTrue(cart.stagedQueries.value.isEmpty())

        vm.updateSqlQuery("SELECT count(*) FROM admissions;")
        vm.stageToCart("Admissions Count")
        assertEquals(1, cart.stagedQueries.value.size)
        assertEquals("Admissions Count", cart.stagedQueries.value[0].title)
        assertEquals("SELECT count(*) FROM admissions;", cart.stagedQueries.value[0].sql)

        // Default title
        vm.stageToCart()
        assertEquals(2, cart.stagedQueries.value.size)
        assertEquals("Editor Query", cart.stagedQueries.value[1].title)
    }

    @Test
    fun testExecuteSqlBlankAndSuccessDefaultAndExplicit(): Unit = kotlinx.coroutines.runBlocking {
        val responseJson = """
            {
                "data": [{"cnt": 42}],
                "columns": ["cnt"],
                "error": null
            }
        """.trimIndent()
        var callCount = 0
        val engine = MockEngine {
            callCount++
            respond(
                content = responseJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = createClient(engine)
        AppContainer.setHttpClientForTest(client)

        val vmDefault = EditorViewModel(scope = this)
        // Blank query is ignored
        vmDefault.updateSqlQuery("   ")
        vmDefault.executeSql()
        kotlinx.coroutines.delay(50)
        assertEquals(0, callCount)

        // Non-blank query succeeds using default AppContainer.aiApi
        vmDefault.updateSqlQuery("SELECT count(*) AS cnt FROM admissions;")
        vmDefault.executeSql()
        kotlinx.coroutines.delay(50)
        assertEquals(1, callCount)
        assertNotNull(vmDefault.state.value.result)
        assertEquals(listOf("cnt"), vmDefault.state.value.result?.columns)
        assertFalse(vmDefault.state.value.isLoading)
        assertNull(vmDefault.state.value.errorMessage)

        // Explicit aiApi
        val explicitApi = AiApi(baseUrl = "http://localhost", httpClient = client)
        val vmExplicit = EditorViewModel(scope = this, aiApi = explicitApi)
        vmExplicit.executeSql()
        kotlinx.coroutines.delay(50)
        assertEquals(2, callCount)
        assertNotNull(vmExplicit.state.value.result)
    }

    @Test
    fun testExecuteSqlFailureWithAndWithoutMessage() = kotlinx.coroutines.runBlocking {
        val engineWithMsg = MockEngine {
            throw IllegalStateException("DuckDB syntax error")
        }
        val api1 = AiApi(baseUrl = "http://localhost", httpClient = createClient(engineWithMsg))
        val vm1 = EditorViewModel(scope = this, aiApi = api1)
        vm1.executeSql("SQL Error: ")
        kotlinx.coroutines.delay(50)
        assertEquals("SQL Error: DuckDB syntax error", vm1.state.value.errorMessage)
        assertFalse(vm1.state.value.isLoading)

        val engineNullMsg = MockEngine {
            throw RuntimeException(null as String?)
        }
        val api2 = AiApi(baseUrl = "http://localhost", httpClient = createClient(engineNullMsg))
        val vm2 = EditorViewModel(scope = this, aiApi = api2)
        vm2.executeSql()
        kotlinx.coroutines.delay(50)
        assertEquals("Execution failed: Unknown error", vm2.state.value.errorMessage)
    }
}
