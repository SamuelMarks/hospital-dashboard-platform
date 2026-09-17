package io.healthplatform.pulsequery.database

import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.driver.native.NativeSqliteDriver

/**
 * iOS / Darwin implementation of [DatabaseDriverFactory] using [NativeSqliteDriver].
 */
class IosDatabaseDriverFactory : DatabaseDriverFactory {
    /**
     * Creates and configures the native Darwin SQLite driver.
     *
     * @return Initialized [SqlDriver] backed by Native SQLite.
     */
    override fun createDriver(): SqlDriver {
        return NativeSqliteDriver(PulseQueryDatabase.Schema, "pulsequery.db")
    }
}
