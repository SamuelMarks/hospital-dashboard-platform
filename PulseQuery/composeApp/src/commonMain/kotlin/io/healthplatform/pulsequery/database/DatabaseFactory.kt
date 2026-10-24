/**
 * Cross-platform SQLDelight database driver factory contract and database creation helpers.
 */
package io.healthplatform.pulsequery.database

import app.cash.sqldelight.db.SqlDriver
import io.healthplatform.pulsequery.core.result.runCatchingPulse

/**
 * Interface that provides a platform-specific SQLDelight driver.
 * On Android, this will be implemented using AndroidSqliteDriver(Context).
 * On iOS, this will use NativeSqliteDriver.
 * On JVM, this will use JdbcSqliteDriver.
 */
interface DatabaseDriverFactory {
    /**
     * Creates and configures the SQLDelight driver for this platform.
     *
     * @return Initialized [SqlDriver] instance.
     */
    fun createDriver(): SqlDriver

    /**
     * Safely creates and configures the SQLDelight driver wrapped in a [Result].
     *
     * @return [Result] containing the initialized [SqlDriver] or a [io.healthplatform.pulsequery.core.error.PulseQueryError].
     */
    fun createDriverResult(): Result<SqlDriver> = runCatchingPulse { createDriver() }
}

/**
 * Creates the database instance given a platform-specific driver.
 *
 * @param driverFactory Factory producing the platform-specific SQL driver.
 * @return Initialized [PulseQueryDatabase] instance.
 */
fun createDatabase(driverFactory: DatabaseDriverFactory): PulseQueryDatabase {
    val driver = driverFactory.createDriver()
    return PulseQueryDatabase(driver)
}

/**
 * Safely creates the database instance wrapped in a [Result].
 *
 * @param driverFactory Factory producing the platform-specific SQL driver.
 * @return [Result] containing the initialized [PulseQueryDatabase] or a [io.healthplatform.pulsequery.core.error.PulseQueryError].
 */
fun createDatabaseResult(driverFactory: DatabaseDriverFactory): Result<PulseQueryDatabase> =
    runCatchingPulse { createDatabase(driverFactory) }
