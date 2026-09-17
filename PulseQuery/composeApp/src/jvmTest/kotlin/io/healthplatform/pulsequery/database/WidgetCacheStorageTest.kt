package io.healthplatform.pulsequery.database

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Validates the WidgetCacheStorage SQL operations using an in-memory JVM SQLite Driver.
 */
class WidgetCacheStorageTest {

    private lateinit var database: PulseQueryDatabase
    private lateinit var cacheStorage: WidgetCacheStorage

    @BeforeTest
    fun setup() {
        val driver: SqlDriver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PulseQueryDatabase.Schema.create(driver)
        database = PulseQueryDatabase(driver)
        cacheStorage = WidgetCacheStorage(database)
    }

    /**
     * Verifies that widgets can be cached and retrieved by dashboard ID with custom and default timestamps.
     */
    @Test
    fun testCacheAndGetWidgets() {
        val testJson = """{"title":"ICU Occupancy","chart_type":"bar","data":[{"x":"Mon","y":25}]}"""
        cacheStorage.cacheWidget(
            widgetId = "w-1",
            dashboardId = "dash-1",
            dataJson = testJson,
            updatedAt = 1000L
        )

        val cachedList = cacheStorage.getCachedWidgets("dash-1")
        assertEquals(1, cachedList.size)
        val first = cachedList.first()
        assertEquals("w-1", first.widget_id)
        assertEquals("dash-1", first.dashboard_id)
        assertEquals(testJson, first.data_json)
        assertEquals(1000L, first.updated_at)

        // Also test default updatedAt parameter
        cacheStorage.cacheWidget(
            widgetId = "w-default",
            dashboardId = "dash-1",
            dataJson = "{}"
        )
        val afterDefault = cacheStorage.getCachedWidgets("dash-1")
        assertEquals(2, afterDefault.size)
    }

    /**
     * Verifies that clearWidget removes a specific widget.
     */
    @Test
    fun testClearSingleWidget() {
        cacheStorage.cacheWidget("w-1", "dash-1", "{}", 1000L)
        cacheStorage.cacheWidget("w-2", "dash-1", "{}", 2000L)

        cacheStorage.clearWidget("w-1")
        val remaining = cacheStorage.getCachedWidgets("dash-1")
        assertEquals(1, remaining.size)
        assertEquals("w-2", remaining.first().widget_id)
    }

    /**
     * Verifies that clearDashboardWidgets removes all widgets for a dashboard.
     */
    @Test
    fun testClearDashboardWidgets() {
        cacheStorage.cacheWidget("w-1", "dash-1", "{}", 1000L)
        cacheStorage.cacheWidget("w-2", "dash-1", "{}", 2000L)
        cacheStorage.cacheWidget("w-3", "dash-2", "{}", 3000L)

        cacheStorage.clearDashboardWidgets("dash-1")
        assertTrue(cacheStorage.getCachedWidgets("dash-1").isEmpty())
        assertEquals(1, cacheStorage.getCachedWidgets("dash-2").size)
    }
}
