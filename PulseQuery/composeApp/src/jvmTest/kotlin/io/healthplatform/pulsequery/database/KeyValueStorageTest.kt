package io.healthplatform.pulsequery.database

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Validates the KeyValueStorage SQL queries using an in-memory JVM SQLite Driver.
 */
class KeyValueStorageTest {

    private lateinit var database: PulseQueryDatabase
    private lateinit var storage: KeyValueStorage

    @BeforeTest
    fun setup() {
        // Initialize an in-memory SQLite database specifically for JVM tests
        val driver: SqlDriver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PulseQueryDatabase.Schema.create(driver)
        database = PulseQueryDatabase(driver)
        storage = KeyValueStorage(database)
    }

    /**
     * Verifies that values can be written to and read from the cache table.
     */
    @Test
    fun testSaveAndGetConfig() {
        storage.save("auth_token", "abc-123")
        val result = storage.get("auth_token")
        
        assertEquals("abc-123", result, "Storage should return the exact value saved.")
    }

    /**
     * Verifies that clearing a config successfully removes it from the table.
     */
    @Test
    fun testClearConfig() {
        storage.save("theme", "dark")
        storage.remove("theme")
        val result = storage.get("theme")
        
        assertNull(result, "Storage should return null after the key is deleted.")
    }
}
