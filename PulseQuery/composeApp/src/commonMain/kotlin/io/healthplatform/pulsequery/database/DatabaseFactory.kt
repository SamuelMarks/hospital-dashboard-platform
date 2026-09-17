package io.healthplatform.pulsequery.database

import app.cash.sqldelight.db.SqlDriver

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
