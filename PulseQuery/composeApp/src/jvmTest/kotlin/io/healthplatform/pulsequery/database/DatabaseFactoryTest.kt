package io.healthplatform.pulsequery.database

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import io.healthplatform.pulsequery.di.AppContainer
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Tests verifying SQLDelight database driver creation, JvmDatabaseDriverFactory, and KeyValueStorage persistence.
 */
class DatabaseFactoryTest {

    @Test
    fun testCreateDatabaseAndStorage() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PulseQueryDatabase.Schema.create(driver)

        val factory = object : DatabaseDriverFactory {
            override fun createDriver() = driver
        }

        val db = createDatabase(factory)
        assertNotNull(db)

        val storage = KeyValueStorage(db)
        assertNull(storage.get("token"))

        storage.save("token", "jwt-secret-value")
        assertEquals("jwt-secret-value", storage.get("token"))

        storage.remove("token")
        assertNull(storage.get("token"))
    }

    @Test
    fun testJvmDatabaseDriverFactoryInMemory() {
        val factory = JvmDatabaseDriverFactory()
        val db = createDatabase(factory)
        assertNotNull(db)

        val storage = KeyValueStorage(db)
        storage.save("key1", "val1")
        assertEquals("val1", storage.get("key1"))
    }

    @Test
    fun testJvmDatabaseDriverFactoryWithFile() {
        val tempFile = File.createTempFile("test_pulse_query_", ".db")
        tempFile.delete() // ensure non-existent file path
        try {
            val factory = JvmDatabaseDriverFactory(tempFile)
            val db = createDatabase(factory)
            assertNotNull(db)

            val storage = KeyValueStorage(db)
            storage.save("file_key", "file_val")
            assertEquals("file_val", storage.get("file_key"))
        } finally {
            tempFile.delete()
        }
    }

    @Test
    fun testAppContainerInitDatabase() {
        val factory = JvmDatabaseDriverFactory()
        AppContainer.initDatabase(factory)

        assertNotNull(AppContainer.keyValueStorage)
        assertNotNull(AppContainer.widgetCacheStorage)

        AppContainer.keyValueStorage?.save("session_test", "123")
        assertEquals("123", AppContainer.keyValueStorage?.get("session_test"))
        AppContainer.keyValueStorage?.remove("session_test")
    }
}
