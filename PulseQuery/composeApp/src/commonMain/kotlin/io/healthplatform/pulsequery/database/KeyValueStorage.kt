package io.healthplatform.pulsequery.database

/**
 * Provides simple key-value storage backed by SQLDelight database.
 */
class KeyValueStorage(private val database: PulseQueryDatabase) {

    fun save(key: String, value: String) {
        database.appDatabaseQueries.insertConfig(key, value)
    }

    fun get(key: String): String? {
        return database.appDatabaseQueries.getConfig(key).executeAsOneOrNull()
    }

    fun remove(key: String) {
        database.appDatabaseQueries.clearConfig(key)
    }
}
