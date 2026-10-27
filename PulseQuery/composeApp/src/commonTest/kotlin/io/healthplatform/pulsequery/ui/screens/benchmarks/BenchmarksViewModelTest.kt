package io.healthplatform.pulsequery.ui.screens.benchmarks

import io.healthplatform.pulsequery.api.apis.BenchmarksApi
import io.healthplatform.pulsequery.api.infrastructure.HttpResponse
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull

/**
 * Comprehensive unit tests for [BenchmarksViewModel], [BenchmarksUiState],
 * [SqlBenchmarkItem], and [MpaxBenchmarkItem].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class BenchmarksViewModelTest {

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
    fun testModelsAndUiStateProperties() {
        val sqlItem = SqlBenchmarkItem(
            theme = "Admissions",
            sql = "SELECT 1",
            difficulty = "Easy",
            description = "Desc"
        )
        assertEquals("Admissions", sqlItem.theme)
        assertEquals("SELECT 1", sqlItem.sql)
        assertEquals("Easy", sqlItem.difficulty)
        assertEquals("Desc", sqlItem.description)

        val mpaxItem = MpaxBenchmarkItem(
            title = "ICU Surge",
            difficulty = "Hard",
            description = "Surge desc",
            targetService = "ICU"
        )
        assertEquals("ICU Surge", mpaxItem.title)
        assertEquals("Hard", mpaxItem.difficulty)
        assertEquals("Surge desc", mpaxItem.description)
        assertEquals("ICU", mpaxItem.targetService)

        val state = BenchmarksUiState(
            isLoading = false,
            errorMessage = "err",
            selectedTabIndex = 1,
            sqlBenchmarks = listOf(sqlItem),
            mpaxBenchmarks = listOf(mpaxItem)
        )
        assertFalse(state.isLoading)
        assertEquals("err", state.errorMessage)
        assertEquals(1, state.selectedTabIndex)
        assertEquals(1, state.sqlBenchmarks.size)
        assertEquals(1, state.mpaxBenchmarks.size)

        // Verify copy and structural equality contracts
        val sqlCopy = sqlItem.copy(difficulty = "Hard")
        assertNotEquals(sqlItem, sqlCopy)
        assertEquals(sqlItem, sqlCopy.copy(difficulty = "Easy"))
        val mpaxCopy = mpaxItem.copy(targetService = "Emergency")
        assertNotEquals(mpaxItem, mpaxCopy)
        val stateCopy = state.copy(selectedTabIndex = 0, errorMessage = null)
        assertEquals(0, stateCopy.selectedTabIndex)
        assertNull(stateCopy.errorMessage)
    }

    @Test
    fun testSelectTabAndLoadBenchmarksSuccessWithFallbacks() = runTest {
        val sqlJson = """
            [
                {
                    "theme": "Cardiology",
                    "sql": "SELECT * FROM admissions",
                    "difficulty": "Hard",
                    "description": "Explicit description"
                },
                {
                    "question": "Question fallback"
                },
                {}
            ]
        """.trimIndent()
        val mpaxJson = """
            [
                {
                    "title": "Ward Rebalancing",
                    "difficulty": "Complex",
                    "description": "Rebalance beds",
                    "target_service": "Med-Surg"
                },
                {}
            ]
        """.trimIndent()

        val engine = MockEngine { req ->
            val content = if (req.url.encodedPath.endsWith("/sql")) sqlJson else mpaxJson
            respond(
                content = content,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        AppContainer.setHttpClientForTest(createClient(engine))

        val vm = BenchmarksViewModel(scope = this)
        vm.selectTab(1)
        assertEquals(1, vm.state.value.selectedTabIndex)

        vm.loadBenchmarks()
        val loadedState = vm.state.first { !it.isLoading && it.sqlBenchmarks.isNotEmpty() }
        assertFalse(loadedState.isLoading)
        assertNull(loadedState.errorMessage)
        assertEquals(3, loadedState.sqlBenchmarks.size)
        assertEquals("Cardiology", loadedState.sqlBenchmarks[0].theme)
        assertEquals("Explicit description", loadedState.sqlBenchmarks[0].description)
        assertEquals("General", loadedState.sqlBenchmarks[1].theme)
        assertEquals("Medium", loadedState.sqlBenchmarks[1].difficulty)
        assertEquals("Question fallback", loadedState.sqlBenchmarks[1].description)
        assertEquals("", loadedState.sqlBenchmarks[2].description)

        assertEquals(2, loadedState.mpaxBenchmarks.size)
        assertEquals("Ward Rebalancing", loadedState.mpaxBenchmarks[0].title)
        assertEquals("Med-Surg", loadedState.mpaxBenchmarks[0].targetService)
        assertEquals("Optimization Scenario", loadedState.mpaxBenchmarks[1].title)
        assertEquals("Standard", loadedState.mpaxBenchmarks[1].difficulty)
        assertEquals("Hospital Wide", loadedState.mpaxBenchmarks[1].targetService)
    }

    @Test
    fun testLoadBenchmarksWithRawStringValuesAndFailures() = runTest {
        val engine = MockEngine {
            respond(
                content = "[]",
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val baseClient = createClient(engine)

        // Subclass BenchmarksApi to return custom Map<String, JsonElement> values
        val customApi = object : BenchmarksApi(baseUrl = "http://localhost", httpClient = baseClient) {
            override suspend fun getSqlBenchmarksApiV1BenchmarksSqlGet(): HttpResponse<List<Map<String, kotlinx.serialization.json.JsonElement>>> {
                val baseResp = super.getSqlBenchmarksApiV1BenchmarksSqlGet()
                return HttpResponse(
                    response = baseResp.response,
                    provider = object : io.healthplatform.pulsequery.api.infrastructure.BodyProvider<List<Map<String, kotlinx.serialization.json.JsonElement>>> {
                        override suspend fun body(
                            response: io.ktor.client.statement.HttpResponse
                        ): List<Map<String, kotlinx.serialization.json.JsonElement>> =
                            listOf(
                                mapOf(
                                    "theme" to kotlinx.serialization.json.JsonPrimitive("RawTheme"),
                                    "sql" to kotlinx.serialization.json.JsonPrimitive("SELECT 2")
                                )
                            )
                        override suspend fun <V : Any> typedBody(
                            response: io.ktor.client.statement.HttpResponse,
                            type: io.ktor.util.reflect.TypeInfo
                        ): V = throw UnsupportedOperationException()
                    }
                )
            }
        }
        val vmCustom = BenchmarksViewModel(scope = this, benchmarksApi = customApi)
        vmCustom.performLoadBenchmarks()
        assertEquals("RawTheme", vmCustom.state.value.sqlBenchmarks.first().theme)

        // Failure with message
        val engineFailMsg = MockEngine { throw IllegalStateException("Benchmarks offline") }
        val vmFail1 = BenchmarksViewModel(
            scope = this,
            benchmarksApi = BenchmarksApi(baseUrl = "http://localhost", httpClient = createClient(engineFailMsg))
        )
        vmFail1.loadBenchmarks()
        val errState1 = vmFail1.state.first { !it.isLoading && it.errorMessage != null }
        assertEquals("Benchmarks offline", errState1.errorMessage)

        // Failure with null message
        val engineFailNull = MockEngine { throw RuntimeException(null as String?) }
        val vmFail2 = BenchmarksViewModel(
            scope = this,
            benchmarksApi = BenchmarksApi(baseUrl = "http://localhost", httpClient = createClient(engineFailNull))
        )
        vmFail2.loadBenchmarks()
        val errState2 = vmFail2.state.first { !it.isLoading && it.errorMessage != null }
        assertEquals("Failed to load benchmarks", errState2.errorMessage)
    }
}
