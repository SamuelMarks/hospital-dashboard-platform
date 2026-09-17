package io.healthplatform.pulsequery.database

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import java.io.File

/**
 * JVM / Desktop implementation of [DatabaseDriverFactory] using [JdbcSqliteDriver].
 *
 * @property dbFile Optional custom file location for the SQLite database. If null, uses in-memory database.
 */
class JvmDatabaseDriverFactory(private val dbFile: File? = null) : DatabaseDriverFactory {
    /**
     * Creates and configures the JVM SQLite driver, ensuring the schema is initialized.
     *
     * @return Initialized [SqlDriver] backed by JDBC SQLite.
     */
    override fun createDriver(): SqlDriver {
        val url = if (dbFile != null) {
            "jdbc:sqlite:${dbFile.absolutePath}"
        } else {
            JdbcSqliteDriver.IN_MEMORY
        }
        val driver = JdbcSqliteDriver(url)
        if (dbFile == null || !dbFile.exists()) {
            PulseQueryDatabase.Schema.create(driver)
        }
        return driver
    }
}
