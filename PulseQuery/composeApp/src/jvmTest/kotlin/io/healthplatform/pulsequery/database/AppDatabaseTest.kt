/**
 * Unit tests for [PulseQueryDatabase], [KeyValueStorage], and [WidgetCacheStorage] backed by JVM SQLite.
 */
package io.healthplatform.pulsequery.database

import app.cash.sqldelight.Query
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Verifies SQLDelight schema creation, query execution, query listeners, and storage adapters.
 */
class AppDatabaseTest {

    private lateinit var database: PulseQueryDatabase

    /**
     * Initializes an in-memory JDBC SQLite database before each test.
     */
    @BeforeTest
    fun setUp() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PulseQueryDatabase.Schema.create(driver)
        database = PulseQueryDatabase(driver)
    }

    /**
     * Verifies inserting and retrieving a configuration entry along with query listener lifecycle.
     */
    @Test
    fun testInsertAndGetConfig() {
        val queries = database.appDatabaseQueries
        val configQuery = queries.getConfig("theme")
        val listener = Query.Listener {}
        configQuery.addListener(listener)
        assertTrue(configQuery.toString().contains("getConfig"))

        queries.insertConfig("theme", "dark")

        val result = configQuery.executeAsOneOrNull()
        assertEquals("dark", result)
        configQuery.removeListener(listener)
    }

    /**
     * Verifies clearing a configuration key removes the stored value.
     */
    @Test
    fun testClearConfig() {
        val queries = database.appDatabaseQueries
        queries.insertConfig("theme", "light")
        queries.clearConfig("theme")

        val result = queries.getConfig("theme").executeAsOneOrNull()
        assertNull(result)
    }

    /**
     * Verifies both SQLite-backed and in-memory fallback modes of [KeyValueStorage] and [WidgetCacheStorage].
     */
    @Test
    fun testCachedWidgetQueriesAndBothStorageModes() {
        val widgetQuery = database.appDatabaseQueries.getCachedWidgetsForDashboard("d1")
        val listener = Query.Listener {}
        widgetQuery.addListener(listener)
        assertTrue(widgetQuery.toString().contains("getCachedWidgetsForDashboard"))
        widgetQuery.removeListener(listener)

        // Test SQLite-backed and null-database fallback side by side
        val dbKv = KeyValueStorage(database)
        val fallbackKv = KeyValueStorage(null)

        dbKv.save("k1", "v1")
        fallbackKv.save("k1", "v1")
        assertEquals("v1", dbKv.get("k1"))
        assertEquals("v1", fallbackKv.get("k1"))

        dbKv.remove("k1")
        fallbackKv.remove("k1")
        assertNull(dbKv.get("k1"))
        assertNull(fallbackKv.get("k1"))

        val dbWidgetCache = WidgetCacheStorage(database)
        val fallbackWidgetCache = WidgetCacheStorage(null)

        dbWidgetCache.cacheWidget("w1", "d1", """{"ok":true}""", 123L)
        fallbackWidgetCache.cacheWidget("w1", "d1", """{"ok":true}""", 123L)

        assertEquals(1, dbWidgetCache.getCachedWidgets("d1").size)
        assertEquals(1, fallbackWidgetCache.getCachedWidgets("d1").size)

        dbWidgetCache.clearWidget("w1")
        fallbackWidgetCache.clearWidget("w1")
        assertTrue(dbWidgetCache.getCachedWidgets("d1").isEmpty())
        assertTrue(fallbackWidgetCache.getCachedWidgets("d1").isEmpty())
    }
}
