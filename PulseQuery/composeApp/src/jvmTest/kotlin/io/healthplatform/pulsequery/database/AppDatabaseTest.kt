package io.healthplatform.pulsequery.database

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AppDatabaseTest {

    private lateinit var database: PulseQueryDatabase

    @BeforeTest
    fun setUp() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PulseQueryDatabase.Schema.create(driver)
        database = PulseQueryDatabase(driver)
    }

    @Test
    fun testInsertAndGetConfig() {
        val queries = database.appDatabaseQueries
        queries.insertConfig("theme", "dark")

        val result = queries.getConfig("theme").executeAsOneOrNull()
        assertEquals("dark", result)
    }

    @Test
    fun testClearConfig() {
        val queries = database.appDatabaseQueries
        queries.insertConfig("theme", "light")
        queries.clearConfig("theme")

        val result = queries.getConfig("theme").executeAsOneOrNull()
        assertNull(result)
    }

    @Test
    fun testCachedWidgetQueriesAndBothStorageModes() {
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
