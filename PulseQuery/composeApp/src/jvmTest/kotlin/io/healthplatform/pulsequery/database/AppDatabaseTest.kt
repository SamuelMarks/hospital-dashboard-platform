package io.healthplatform.pulsequery.database

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

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
}
