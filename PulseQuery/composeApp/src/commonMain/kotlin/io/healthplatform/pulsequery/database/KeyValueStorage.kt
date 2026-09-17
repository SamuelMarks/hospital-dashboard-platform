/**
 * Key-Value Storage module for Pulse Query configuration and auth session tokens.
 */
package io.healthplatform.pulsequery.database

/**
 * Provides simple key-value storage backed by SQLDelight database, with in-memory fallback
 * for execution targets where native SQLite drivers are uninitialized.
 *
 * @property database Optional SQLDelight database connection instance.
 */
class KeyValueStorage(private val database: PulseQueryDatabase? = null) {
    private val memoryStorage: MutableMap<String, String> = mutableMapOf()

    /**
     * Persists a string value for the specified key.
     *
     * @param key Unique key to associate with the value.
     * @param value String value to persist.
     */
    fun save(key: String, value: String) {
        val db = database
        if (db != null) {
            db.appDatabaseQueries.insertConfig(key, value)
        } else {
            memoryStorage[key] = value
        }
    }

    /**
     * Retrieves the string value associated with the specified key, if present.
     *
     * @param key Key to look up.
     * @return String value or null if not found.
     */
    fun get(key: String): String? {
        val db = database
        return if (db != null) {
            db.appDatabaseQueries.getConfig(key).executeAsOneOrNull()
        } else {
            memoryStorage[key]
        }
    }

    /**
     * Removes the key and its associated value from storage.
     *
     * @param key Key to delete.
     */
    fun remove(key: String) {
        val db = database
        if (db != null) {
            db.appDatabaseQueries.clearConfig(key)
        } else {
            memoryStorage.remove(key)
        }
    }
}
