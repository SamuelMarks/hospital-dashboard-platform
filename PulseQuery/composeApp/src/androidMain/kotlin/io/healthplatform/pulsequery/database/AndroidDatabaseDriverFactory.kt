package io.healthplatform.pulsequery.database

import android.content.Context
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.android.AndroidSqliteDriver

/**
 * Android implementation of [DatabaseDriverFactory] using [AndroidSqliteDriver].
 *
 * @property context Android context used for SQLite database creation and file access.
 */
class AndroidDatabaseDriverFactory(private val context: Context) : DatabaseDriverFactory {
    /**
     * Creates and configures the Android SQLite driver.
     *
     * @return Initialized [SqlDriver] backed by Android SQLite.
     */
    override fun createDriver(): SqlDriver {
        return AndroidSqliteDriver(PulseQueryDatabase.Schema, context, "pulsequery.db")
    }
}
