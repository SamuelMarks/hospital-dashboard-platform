package io.healthplatform.pulsequery.ui.screens.dashboard

import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.ExecutionApi
import io.healthplatform.pulsequery.api.models.DashboardResponse
import io.healthplatform.pulsequery.api.models.HttpConfig
import io.healthplatform.pulsequery.api.models.WidgetIn
import io.healthplatform.pulsequery.api.models.WidgetResponse
import io.healthplatform.pulsequery.database.WidgetCacheStorage
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.network.DashboardWebSocketRepository
import io.healthplatform.pulsequery.network.NetworkHealthRepository
import io.healthplatform.pulsequery.network.QueryCartRepository
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Comprehensive unit tests for [DashboardViewModel], [DashboardUiState], and [WidgetRenderState].
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {

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

    private val dashboardJson = """
        [
            {
                "id": "d-1",
                "name": "Executive",
                "owner_id": "u-1",
                "permission_level": "OWNER",
                "widgets": [
                    {
                        "id": "w-sql",
                        "dashboard_id": "d-1",
                        "title": "SQL Chart",
                        "type": "SQL",
                        "visualization": "bar_chart",
                        "config": {"query": "SELECT dept, cnt FROM t", "xKey": "dept", "yKey": "cnt"}
                    },
                    {
                        "id": "w-text",
                        "dashboard_id": "d-1",
                        "title": "Notes",
                        "type": "TEXT",
                        "visualization": "markdown",
                        "config": {"content": "Hello markdown"}
                    }
                ]
            }
        ]
    """.trimIndent()

    private val refreshJson = """
        {
            "w-sql": {
                "data": [
                    {"dept": "ICU", "cnt": 12.5}
                ],
                "columns": ["dept", "cnt"],
                "error": null
            }
        }
    """.trimIndent()

    @Test
    fun testStateAndRenderModels() {
        val render = WidgetRenderState(
            data = listOf("ICU" to 10f),
            tableColumns = listOf("unit"),
            tableRows = listOf(listOf("ICU")),
            textContent = "md",
            errorMessage = "err"
        )
        assertEquals(1, render.data.size)
        assertEquals(listOf("unit"), render.tableColumns)
        assertEquals(1, render.tableRows.size)
        assertEquals("md", render.textContent)
        assertEquals("err", render.errorMessage)

        val uiState = DashboardUiState(
            dashboards = emptyList(),
            activeDashboard = null,
            widgetDataMap = mapOf("w1" to render),
            isLoading = false,
            errorMessage = "e",
            filterDepartment = "ICU",
            filterTimeRange = "7d",
            isOfflineSnapshot = true
        )
        assertTrue(uiState.dashboards.isEmpty())
        assertNull(uiState.activeDashboard)
        assertEquals(1, uiState.widgetDataMap.size)
        assertFalse(uiState.isLoading)
        assertEquals("e", uiState.errorMessage)
        assertEquals("ICU", uiState.filterDepartment)
        assertEquals("7d", uiState.filterTimeRange)
        assertTrue(uiState.isOfflineSnapshot)
    }

    @Test
    fun testLoadDashboardsRefreshFiltersAndCollaborators() = kotlinx.coroutines.runBlocking {
        val cache = WidgetCacheStorage()
        var lastRefreshBody: String? = null
        val engine = MockEngine { req ->
            when {
                req.url.encodedPath.endsWith("/refresh") -> {
                    lastRefreshBody = req.body.toString()
                    respond(
                        content = refreshJson,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                else -> respond(
                    content = dashboardJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        AppContainer.setHttpClientForTest(createClient(engine))
        AppContainer.widgetCacheStorage = cache

        val vm = DashboardViewModel(scope = this)
        assertTrue(vm.collaborators.value.isEmpty())
        assertTrue(vm.cartItems.value.isEmpty())

        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals(1, vm.state.value.dashboards.size)
        assertEquals("d-1", vm.state.value.activeDashboard?.id)
        assertEquals("Hello markdown", vm.state.value.widgetDataMap["w-text"]?.textContent)
        assertEquals(listOf("ICU" to 12.5f), vm.state.value.widgetDataMap["w-sql"]?.data)
        assertEquals(1, cache.getCachedWidgets("d-1").size)

        // Reloading when activeDashboard is already set preserves activeDashboard
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals("d-1", vm.state.value.activeDashboard?.id)

        // updateFilters & resetFilters
        vm.updateFilters("Cardiology", "24h")
        kotlinx.coroutines.delay(50)
        assertEquals("Cardiology", vm.state.value.filterDepartment)
        assertEquals("24h", vm.state.value.filterTimeRange)
        assertNotNull(lastRefreshBody)

        vm.updateFilters("  ", "  ")
        kotlinx.coroutines.delay(50)

        vm.resetFilters()
        kotlinx.coroutines.delay(50)
        assertNull(vm.state.value.filterDepartment)
        assertNull(vm.state.value.filterTimeRange)

        // selectDashboard
        val active = assertNotNull(vm.state.value.activeDashboard)
        vm.selectDashboard(active)
        kotlinx.coroutines.delay(50)

        vm.onCleared()
    }

    @Test
    fun testLoadDashboardsEmptyAndTextOnlyDashboard() = kotlinx.coroutines.runBlocking {
        var returnEmptyList = true
        val textOnlyDashboardJson = """
            [
                {
                    "id": "d-text",
                    "name": "Text Only",
                    "owner_id": "u-1",
                    "widgets": [
                        {
                            "id": "w-t1",
                            "dashboard_id": "d-text",
                            "title": "T1",
                            "type": "TEXT",
                            "visualization": "markdown",
                            "config": {"text": "Fallback text field"}
                        },
                        {
                            "id": "w-t2",
                            "dashboard_id": "d-text",
                            "title": "T2",
                            "type": "TEXT",
                            "visualization": "markdown",
                            "config": {}
                        }
                    ]
                }
            ]
        """.trimIndent()

        val engine = MockEngine {
            respond(
                content = if (returnEmptyList) "[]" else textOnlyDashboardJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val client = createClient(engine)
        val vm = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = client),
            executionApi = ExecutionApi(baseUrl = "http://localhost", httpClient = client)
        )

        // Empty dashboard list -> activeDashboard is null, updateFilters is no-op
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertNull(vm.state.value.activeDashboard)
        assertTrue(vm.state.value.widgetDataMap.isEmpty())
        vm.updateFilters("ICU", "7d")
        kotlinx.coroutines.delay(50)

        // Text-only dashboard -> skips execution API call and populates textMap
        returnEmptyList = false
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals("Fallback text field", vm.state.value.widgetDataMap["w-t1"]?.textContent)
        assertEquals("", vm.state.value.widgetDataMap["w-t2"]?.textContent)
    }

    @Test
    fun testOfflineCacheFallbacksOnLoadAndRefreshFailures() = kotlinx.coroutines.runBlocking {
        val cache = WidgetCacheStorage()
        var failList = false
        var failRefresh = false
        val engine = MockEngine { req ->
            if (req.url.encodedPath.endsWith("/refresh")) {
                if (failRefresh) throw IllegalStateException("Refresh failed")
                respond(
                    content = """{}""",
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            } else {
                if (failList) throw IllegalStateException("List failed")
                respond(
                    content = dashboardJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val client = createClient(engine)
        val vm = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = client),
            executionApi = ExecutionApi(baseUrl = "http://localhost", httpClient = client),
            widgetCacheProvider = { cache }
        )

        // First load when payloadMap has no entry for w-sql -> returns empty WidgetRenderState()
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals(WidgetRenderState(), vm.state.value.widgetDataMap["w-sql"])

        // Select a dashboard whose widgets list is null
        vm.selectDashboard(DashboardResponse(id = "d-null-widgets", name = "NullW", ownerId = "u-1", widgets = null))
        kotlinx.coroutines.delay(50)

        // Restore d-1 as active dashboard
        failRefresh = false
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)

        // Refresh failure when cache is empty -> populates errorMessage on WidgetRenderState
        failRefresh = true
        vm.selectDashboard(assertNotNull(vm.state.value.activeDashboard))
        kotlinx.coroutines.delay(50)
        assertEquals("Refresh failed", vm.state.value.widgetDataMap["w-sql"]?.errorMessage)

        // Refresh failure with null exception message when cache is empty
        val engineRefreshNull = MockEngine { req ->
            if (req.url.encodedPath.endsWith("/refresh")) throw RuntimeException()
            respond(
                content = dashboardJson,
                status = HttpStatusCode.OK,
                headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
            )
        }
        val clientNull = createClient(engineRefreshNull)
        val vmNull = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = clientNull),
            executionApi = ExecutionApi(baseUrl = "http://localhost", httpClient = clientNull),
            widgetCacheProvider = { null }
        )
        vmNull.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load data", vmNull.state.value.widgetDataMap["w-sql"]?.errorMessage)

        // Now populate cache (including valid JSON, invalid JSON, and another widget so cached list is non-empty when w-sql is absent)
        cache.cacheWidget("w-sql", "d-1", """{"data":[{"dept":"ER","cnt":5}]}""")
        vm.selectDashboard(assertNotNull(vm.state.value.activeDashboard))
        kotlinx.coroutines.delay(50)
        assertTrue(vm.state.value.isOfflineSnapshot)
        assertEquals(listOf("ER" to 5f), vm.state.value.widgetDataMap["w-sql"]?.data)

        // List failure when activeDashboard is set and cache is non-empty -> restores from cache
        failList = true
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertTrue(vm.state.value.isOfflineSnapshot)
        assertNull(vm.state.value.errorMessage)

        // List failure when activeDashboard has widgets = null and cache is non-empty
        vm.selectDashboard(DashboardResponse(id = "d-1", name = "Exec", ownerId = "u-1", widgets = null))
        kotlinx.coroutines.delay(50)
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertTrue(vm.state.value.isOfflineSnapshot)

        // Restore activeDashboard with widgets, then test invalid JSON in cache and missing widget in cache
        failList = false
        failRefresh = false
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        failList = true
        cache.cacheWidget("w-sql", "d-1", "NOT_JSON")
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals(WidgetRenderState(), vm.state.value.widgetDataMap["w-sql"])

        // When cache has a different widget ID for d-1 so cached is non-empty, but w-sql is absent from cachedJsonByWidgetId
        cache.clearDashboardWidgets("d-1")
        cache.cacheWidget("w-other", "d-1", """{"data":[]}""")
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals(WidgetRenderState(), vm.state.value.widgetDataMap["w-sql"])

        // List failure when widgetCacheProvider returns null while activeDashboard is non-null
        val vmNullCacheWithActive = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = client),
            executionApi = ExecutionApi(baseUrl = "http://localhost", httpClient = client),
            widgetCacheProvider = { null }
        )
        failList = false
        vmNullCacheWithActive.loadDashboards()
        kotlinx.coroutines.delay(50)
        failList = true
        vmNullCacheWithActive.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load dashboards: List failed", vmNullCacheWithActive.state.value.errorMessage)
        // Also call retryHealthAndLoad on vmNullCacheWithActive (uses default AppContainer.networkHealthRepository)
        vmNullCacheWithActive.retryHealthAndLoad()
        kotlinx.coroutines.delay(50)

        // List failure when cache is empty -> sets top-level errorMessage
        cache.clearDashboardWidgets("d-1")
        vm.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load dashboards: List failed", vm.state.value.errorMessage)

        // List failure when activeDashboard is null and error.message is null
        vmNull.selectDashboard(DashboardResponse(id = "d-none", name = "N", ownerId = "u-1", widgets = null))
        val vmNoActive = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(
                baseUrl = "http://localhost",
                httpClient = createClient(MockEngine { throw RuntimeException() })
            ),
            widgetCacheProvider = { null }
        )
        vmNoActive.loadDashboards()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to load dashboards: Unknown error", vmNoActive.state.value.errorMessage)
    }

    @Test
    fun testParseWidgetExecutionElementAllBranches() = kotlinx.coroutines.runBlocking {
        val vm = DashboardViewModel(scope = this)
        val widgetNoKeys = WidgetResponse(
            id = "w-1",
            dashboardId = "d-1",
            title = "Chart",
            type = "SQL",
            visualization = "bar_chart",
            config = JsonObject(emptyMap())
        )

        // Non-JsonObject element
        assertEquals(WidgetRenderState(), vm.parseWidgetExecutionElement(widgetNoKeys, JsonNull))

        // Error primitive: non-primitive error and non-array data
        val nonPrimErrObj = Json.parseToJsonElement("""{"error": {}, "data": "not-an-array"}""")
        assertEquals(WidgetRenderState(), vm.parseWidgetExecutionElement(widgetNoKeys, nonPrimErrObj))

        // Error primitive: non-blank string
        val errObj = Json.parseToJsonElement("""{"error": "Query timeout"}""")
        assertEquals("Query timeout", vm.parseWidgetExecutionElement(widgetNoKeys, errObj).errorMessage)

        // Error primitive: blank string and non-string primitive
        val blankErrObj = Json.parseToJsonElement("""{"error": "   ", "data": []}""")
        assertEquals(WidgetRenderState(), vm.parseWidgetExecutionElement(widgetNoKeys, blankErrObj))
        val numErrObj = Json.parseToJsonElement("""{"error": 123}""")
        assertEquals(WidgetRenderState(), vm.parseWidgetExecutionElement(widgetNoKeys, numErrObj))

        // Data array with single column, missing/non-numeric/non-primitive values, and configured keys not in cols
        val widgetUnmatchedKeys = widgetNoKeys.copy(
            config = buildJsonObject {
                put("xKey", JsonPrimitive("missing_x"))
                put("yKey", JsonPrimitive("   "))
            }
        )
        val singleColObj = Json.parseToJsonElement("""{"data": [{"only_col": "val"}, {"only_col": null}, {"only_col": {}}]}""")
        val singleParsed = vm.parseWidgetExecutionElement(widgetUnmatchedKeys, singleColObj)
        assertEquals(listOf("only_col"), singleParsed.tableColumns)
        assertEquals(3, singleParsed.data.size)

        // Empty JsonObject row in data array (cols is empty)
        val emptyRowObj = Json.parseToJsonElement("""{"data": [{}]}""")
        val emptyRowParsed = vm.parseWidgetExecutionElement(widgetNoKeys, emptyRowObj)
        assertEquals(listOf("Unknown" to 0f), emptyRowParsed.data)
        val emptyRowWithConfig = vm.parseWidgetExecutionElement(widgetUnmatchedKeys, emptyRowObj)
        assertEquals(listOf("Unknown" to 0f), emptyRowWithConfig.data)

        // Multi-column result where column 1 is a string and column 2 is numeric (e.g., Throughput Velocity)
        val multiColObj = Json.parseToJsonElement(
            """{"data": [{"activity_date": "2077-09-03", "Location": "PCU_Mixed_D", "total_churn": 437}]}"""
        )
        val multiColParsed = vm.parseWidgetExecutionElement(widgetNoKeys, multiColObj)
        assertEquals(listOf("2077-09-03" to 437f), multiColParsed.data)

        // Multi-column result where column 1 is a non-JsonPrimitive object and column 2 is numeric
        val nonPrimColObj = Json.parseToJsonElement(
            """{"data": [{"c1": "a", "c2": {}, "c3": 99}]}"""
        )
        val nonPrimColParsed = vm.parseWidgetExecutionElement(widgetNoKeys, nonPrimColObj)
        assertEquals(listOf("a" to 99f), nonPrimColParsed.data)

        // Multi-column result where all remaining columns are non-numeric strings
        val allStringColsObj = Json.parseToJsonElement(
            """{"data": [{"c1": "a", "c2": "b", "c3": "c"}]}"""
        )
        val allStringParsed = vm.parseWidgetExecutionElement(widgetNoKeys, allStringColsObj)
        assertEquals(listOf("a" to 0f), allStringParsed.data)
    }

    @Test
    fun testCreateDeleteDashboardDeleteWidgetUndoRedoAndReorder() = kotlinx.coroutines.runBlocking {
        var failDeleteWidget = false
        var failCreateWidget = false
        var failReorder = false
        val engine = MockEngine { req ->
            when {
                req.method == HttpMethod.Post && req.url.encodedPath.trimEnd('/').endsWith("/dashboards") -> respond(
                    content = """{"id":"d-2","name":"New","owner_id":"u-1","widgets":[]}""",
                    status = HttpStatusCode.Created,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                req.method == HttpMethod.Delete && req.url.encodedPath.contains("/dashboards/d-") -> respond(
                    content = "",
                    status = HttpStatusCode.NoContent
                )
                req.method == HttpMethod.Delete && req.url.encodedPath.contains("/widgets/") -> {
                    if (failDeleteWidget) throw IllegalStateException("Delete widget err")
                    respond(content = "", status = HttpStatusCode.NoContent)
                }
                req.method == HttpMethod.Post && req.url.encodedPath.endsWith("/widgets") -> {
                    if (failCreateWidget) throw IllegalStateException("Restore widget err")
                    respond(
                        content = """{"id":"w-restored","dashboard_id":"d-1","title":"Restored","type":"SQL","visualization":"table","config":{}}""",
                        status = HttpStatusCode.Created,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                req.method == HttpMethod.Post && req.url.encodedPath.endsWith("/reorder") -> {
                    if (failReorder) throw IllegalStateException("Reorder failed")
                    respond(
                        content = dashboardJson.trimStart('[').trimEnd(']'),
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                req.url.encodedPath.endsWith("/refresh") -> respond(
                    content = refreshJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    content = dashboardJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val client = createClient(engine)
        val wsRepo = DashboardWebSocketRepository(httpClient = client, coroutineScope = this)
        val healthRepo = NetworkHealthRepository(scope = this)
        val vm = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = client),
            executionApi = ExecutionApi(baseUrl = "http://localhost", httpClient = client),
            webSocketRepository = wsRepo,
            networkHealthRepository = healthRepo,
            queryCartRepository = QueryCartRepository()
        )

        // observeRemoteWidgetUpdates triggers loadDashboards
        val obsJob = launch { vm.observeRemoteWidgetUpdates() }
        wsRepo.onRemoteWidgetUpdate("w-sql")
        kotlinx.coroutines.delay(50)
        assertEquals("d-1", vm.state.value.activeDashboard?.id)

        // createDashboard blank and valid
        vm.createDashboard("   ")
        vm.createDashboard("New Dashboard")
        kotlinx.coroutines.delay(50)

        // deleteDashboard
        vm.deleteDashboard("d-1")
        kotlinx.coroutines.delay(50)

        // buildWidgetInFromResponse for TEXT, HTTP, and SQL variants (including non-JsonPrimitive config entries)
        val textW1 = WidgetResponse("T", "TEXT", "markdown", buildJsonObject { put("content", JsonPrimitive("c")) }, "w1", "d1")
        val textW2 = WidgetResponse("T", "TEXT", "markdown", buildJsonObject { put("text", JsonPrimitive("t")) }, "w2", "d1")
        val textW3 = WidgetResponse("T", "TEXT", "markdown", JsonObject(emptyMap()), "w3", "d1")
        val textW4 = WidgetResponse("T", "TEXT", "markdown", buildJsonObject { put("content", JsonObject(emptyMap())); put("text", JsonObject(emptyMap())) }, "w3b", "d1")
        assertTrue(vm.buildWidgetInFromResponse(textW1) is WidgetIn.Text)
        assertTrue(vm.buildWidgetInFromResponse(textW2) is WidgetIn.Text)
        assertTrue(vm.buildWidgetInFromResponse(textW3) is WidgetIn.Text)
        assertTrue(vm.buildWidgetInFromResponse(textW4) is WidgetIn.Text)

        val httpW1 = WidgetResponse(
            "H",
            "HTTP",
            "table",
            buildJsonObject {
                put("url", JsonPrimitive("https://api"))
                put("method", JsonPrimitive("POST"))
            },
            "w4",
            "d1"
        )
        val httpW2 = WidgetResponse("H", "HTTP", "table", buildJsonObject { put("method", JsonPrimitive("UNKNOWN")) }, "w5", "d1")
        val httpW3 = WidgetResponse("H", "HTTP", "table", buildJsonObject { put("url", JsonObject(emptyMap())); put("method", JsonObject(emptyMap())) }, "w5b", "d1")
        assertEquals(HttpConfig.Method.POST, (vm.buildWidgetInFromResponse(httpW1) as WidgetIn.Http).config.method)
        assertEquals(HttpConfig.Method.GET, (vm.buildWidgetInFromResponse(httpW2) as WidgetIn.Http).config.method)
        assertEquals(HttpConfig.Method.GET, (vm.buildWidgetInFromResponse(httpW3) as WidgetIn.Http).config.method)

        val sqlW1 = WidgetResponse("S", "SQL", "table", buildJsonObject { put("query", JsonPrimitive("SELECT 2")) }, "w6", "d1")
        val sqlW2 = WidgetResponse("S", "SQL", "table", JsonObject(emptyMap()), "w7", "d1")
        val sqlW3 = WidgetResponse("S", "SQL", "table", buildJsonObject { put("query", JsonObject(emptyMap())) }, "w7b", "d1")
        assertEquals("SELECT 2", (vm.buildWidgetInFromResponse(sqlW1) as WidgetIn.Sql).config.query)
        assertEquals("SELECT 1", (vm.buildWidgetInFromResponse(sqlW2) as WidgetIn.Sql).config.query)
        assertEquals("SELECT 1", (vm.buildWidgetInFromResponse(sqlW3) as WidgetIn.Sql).config.query)

        val jsonSer = Json { ignoreUnknownKeys = true }
        val decodedText = jsonSer.decodeFromString<WidgetIn>("""{"type":"TEXT","title":"T","visualization":"markdown","config":{"content":"hi"}}""")
        val decodedHttp = jsonSer.decodeFromString<WidgetIn>("""{"type":"HTTP","title":"H","visualization":"table","config":{"url":"https://api"}}""")
        val decodedSql = jsonSer.decodeFromString<WidgetIn>("""{"type":"SQL","title":"S","visualization":"table","config":{"query":"SELECT 1"}}""")
        val decodedNoType = jsonSer.decodeFromString<WidgetIn>("""{"title":"S","visualization":"table","config":{"query":"SELECT 1"}}""")
        assertTrue(decodedText is WidgetIn.Text)
        assertTrue(decodedHttp is WidgetIn.Http)
        assertTrue(decodedSql is WidgetIn.Sql)
        assertTrue(decodedNoType is WidgetIn.Sql)

        // deleteWidgetWithUndo, undo, redo
        vm.deleteWidgetWithUndo(sqlW1)
        kotlinx.coroutines.delay(50)
        vm.undo()
        kotlinx.coroutines.delay(50)
        vm.redo()
        kotlinx.coroutines.delay(50)

        // Undo failure
        failCreateWidget = true
        vm.undo()
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to restore widget: Restore widget err", vm.state.value.errorMessage)

        // Delete widget failure (with message and null message)
        failDeleteWidget = true
        vm.deleteWidgetWithUndo(sqlW1)
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to delete widget: Delete widget err", vm.state.value.errorMessage)

        // reorderWidget: valid indices, out-of-bounds indices, and failure
        vm.reorderWidget(-1, 0)
        vm.reorderWidget(99, 0)
        vm.reorderWidget(0, -1)
        vm.reorderWidget(0, 99)
        vm.reorderWidget(0, 1)
        kotlinx.coroutines.delay(50)

        failReorder = true
        vm.reorderWidget(0, 1)
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to persist widget order: Reorder failed", vm.state.value.errorMessage)

        // reorderWidget when activeDashboard is null or widgets is null
        vm.selectDashboard(DashboardResponse(id = "d-null-w", name = "NoW", ownerId = "u-1", widgets = null))
        kotlinx.coroutines.delay(50)
        vm.reorderWidget(0, 1)

        // retryHealthAndLoad
        vm.retryHealthAndLoad()
        kotlinx.coroutines.delay(50)

        obsJob.cancel()
    }

    @Test
    fun testCreateAndDeleteDashboardAndWidgetFailures() = kotlinx.coroutines.runBlocking {
        var errMsg: String? = "Server error"
        val failClient = createClient(MockEngine { throw RuntimeException(errMsg) })
        val vm = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = failClient)
        )

        vm.createDashboard("D1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to create dashboard: Server error", vm.state.value.errorMessage)

        vm.deleteDashboard("d-1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to delete dashboard: Server error", vm.state.value.errorMessage)

        errMsg = null
        vm.createDashboard("D1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to create dashboard: Unknown error", vm.state.value.errorMessage)

        vm.deleteDashboard("d-1")
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to delete dashboard: Unknown error", vm.state.value.errorMessage)

        val w = WidgetResponse("S", "SQL", "table", JsonObject(emptyMap()), "w1", "d1")
        vm.deleteWidgetWithUndo(w)
        kotlinx.coroutines.delay(50)
        assertEquals("Failed to delete widget: Unknown error", vm.state.value.errorMessage)

        vm.reorderWidget(0, 1)
    }

    @Test
    fun testExecuteWidgetNaturalTextBranches() = kotlinx.coroutines.runBlocking {
        var failRefreshWidget = false
        var omitWidgetPayload = false
        val engine = MockEngine { req ->
            when {
                req.url.encodedPath.contains("/widgets/") && req.url.encodedPath.endsWith("/refresh") -> {
                    if (failRefreshWidget) throw IllegalStateException("LLM error")
                    val body = if (omitWidgetPayload) {
                        "{}"
                    } else {
                        """{"w-sql":{"data":[{"dept":"ICU","cnt":99}],"columns":["dept","cnt"],"generated_sql":"SELECT 'ICU' AS dept, 99 AS cnt","processor_used":"ollama:llama3","natural_text":"Show ICU"}}"""
                    }
                    respond(
                        content = body,
                        status = HttpStatusCode.OK,
                        headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                    )
                }
                req.url.encodedPath.endsWith("/refresh") -> respond(
                    content = refreshJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
                else -> respond(
                    content = dashboardJson,
                    status = HttpStatusCode.OK,
                    headers = headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString())
                )
            }
        }
        val client = createClient(engine)
        val vm = DashboardViewModel(
            scope = this,
            dashboardsApi = DashboardsApi(baseUrl = "http://localhost", httpClient = client),
            executionApi = ExecutionApi(baseUrl = "http://localhost", httpClient = client)
        )

        // Guard when activeDashboard is null
        vm.executeWidgetNaturalText("w-sql", "Show ICU")

        // Guard when activeDashboard has widgets = null
        vm.selectDashboard(DashboardResponse(id = "d-nw", name = "NW", ownerId = "u-1", widgets = null))
        kotlinx.coroutines.delay(20)
        vm.executeWidgetNaturalText("w-sql", "Show ICU")

        vm.loadDashboards()
        kotlinx.coroutines.delay(50)

        // Guard when widgetId not found or blank text
        vm.executeWidgetNaturalText("missing-id", "Show ICU")
        vm.executeWidgetNaturalText("w-sql", "   ")

        // Also test when widgetId is not in widgetDataMap initially (by clearing map via a widget with no initial data)
        val nlWidgetConfigured = WidgetResponse(
            id = "w-nl-cfg",
            dashboardId = "d-1",
            title = "NL Cfg",
            type = "SQL",
            visualization = "table",
            config = buildJsonObject {
                put("allow_natural_text", JsonPrimitive(true))
                put("processor", JsonPrimitive("ollama:llama3"))
                put("natural_text_prompt", JsonPrimitive("Default prompt"))
            }
        )
        val parsedCfg = vm.parseWidgetExecutionElement(nlWidgetConfigured, JsonObject(emptyMap()))
        assertTrue(parsedCfg.allowNaturalText)
        assertEquals("ollama:llama3", parsedCfg.processor.value)
        assertEquals("Default prompt", parsedCfg.naturalTextPrompt)

        // Success with processorOverride
        vm.executeWidgetNaturalText(
            "w-sql",
            "Show ICU",
            io.healthplatform.pulsequery.core.model.ProcessorId("ollama:llama3")
        )
        kotlinx.coroutines.delay(50)
        val stateAfterOk = assertNotNull(vm.state.value.widgetDataMap["w-sql"])
        assertEquals("SELECT 'ICU' AS dept, 99 AS cnt", stateAfterOk.generatedSql)
        assertEquals("ollama:llama3", stateAfterOk.processor.value)
        assertEquals("Show ICU", stateAfterOk.naturalTextPrompt)
        assertTrue(stateAfterOk.allowNaturalText)

        // Success when payload omits widget key
        omitWidgetPayload = true
        vm.executeWidgetNaturalText("w-sql", "Show ICU")
        kotlinx.coroutines.delay(50)
        assertFalse(assertNotNull(vm.state.value.widgetDataMap["w-sql"]).isExecutingNaturalText)

        // Failure path (and when widgetDataMap does not contain the target widget ID)
        failRefreshWidget = true
        vm.selectDashboard(
            DashboardResponse(
                id = "d-1",
                name = "Exec",
                ownerId = "u-1",
                widgets = listOf(
                    WidgetResponse("Unmapped", "SQL", "table", JsonObject(emptyMap()), "w-unmapped", "d-1")
                )
            )
        )
        vm.executeWidgetNaturalText("w-unmapped", "Show ICU")
        kotlinx.coroutines.delay(50)
        assertEquals("LLM error", assertNotNull(vm.state.value.widgetDataMap["w-unmapped"]).errorMessage)

        // Verify extractWidgetSubtitle branches
        val wTopSub = WidgetResponse(
            title = "T",
            type = "SQL",
            visualization = "table",
            config = JsonObject(emptyMap()),
            id = "w1",
            dashboardId = "d1",
            subtitle = "  Top Sub  "
        )
        assertEquals("Top Sub", extractWidgetSubtitle(wTopSub))

        val wCfgSub = WidgetResponse(
            title = "T",
            type = "SQL",
            visualization = "table",
            config = buildJsonObject { put("subtitle", JsonPrimitive("  Config Sub  ")) },
            id = "w2",
            dashboardId = "d1",
            subtitle = "   "
        )
        assertEquals("Config Sub", extractWidgetSubtitle(wCfgSub))

        val wCfgDesc = WidgetResponse(
            title = "T",
            type = "SQL",
            visualization = "table",
            config = buildJsonObject {
                put("subtitle", JsonPrimitive("   "))
                put("description", JsonPrimitive("  Desc Sub  "))
            },
            id = "w3",
            dashboardId = "d1",
            subtitle = null
        )
        assertEquals("Desc Sub", extractWidgetSubtitle(wCfgDesc))

        val wEmptySub = WidgetResponse(
            title = "T",
            type = "SQL",
            visualization = "table",
            config = buildJsonObject { put("description", JsonPrimitive("   ")) },
            id = "w4",
            dashboardId = "d1",
            subtitle = null
        )
        assertNull(extractWidgetSubtitle(wEmptySub))

        val wMissingAll = WidgetResponse(
            title = "T",
            type = "SQL",
            visualization = "table",
            config = JsonObject(emptyMap()),
            id = "w5",
            dashboardId = "d1",
            subtitle = null
        )
        assertNull(extractWidgetSubtitle(wMissingAll))
    }
}
