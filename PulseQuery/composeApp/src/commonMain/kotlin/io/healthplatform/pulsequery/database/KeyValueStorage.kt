/**
 * Key-Value Storage module for Pulse Query configuration and auth session tokens.
 */
package io.healthplatform.pulsequery.database

import io.healthplatform.pulsequery.core.result.runCatchingPulse

/**
 * Provides simple key-value storage backed by SQLDelight database, with in-memory fallback
 * for execution targets where native SQLite drivers are uninitialized.
 *
 * @property database Optional SQLDelight database connection instance.
 */
open class KeyValueStorage(private val database: PulseQueryDatabase? = null) {
    private val memoryStorage: MutableMap<String, String> = mutableMapOf()

    /**
     * Persists a string value for the specified key.
     *
     * @param key Unique key to associate with the value.
     * @param value String value to persist.
     */
    open fun save(key: String, value: String) {
        val db = database
        if (db != null) {
            db.appDatabaseQueries.insertConfig(key, value)
        } else {
            memoryStorage[key] = value
        }
    }

    /**
     * Safely persists a string value for the specified key wrapped in a [Result].
     *
     * @param key Unique key to associate with the value.
     * @param value String value to persist.
     * @return [Result] containing [Unit] on success or a [io.healthplatform.pulsequery.core.error.PulseQueryError] on failure.
     */
    open fun saveResult(key: String, value: String): Result<Unit> =
        runCatchingPulse { save(key, value) }

    /**
     * Retrieves the string value associated with the specified key, if present.
     *
     * @param key Key to look up.
     * @return String value or null if not found.
     */
    open fun get(key: String): String? {
        val db = database
        return if (db != null) {
            db.appDatabaseQueries.getConfig(key).executeAsOneOrNull()
        } else {
            memoryStorage[key]
        }
    }

    /**
     * Safely retrieves the string value associated with the specified key wrapped in a [Result].
     *
     * @param key Key to look up.
     * @return [Result] containing the string value (or null) on success, or a [io.healthplatform.pulsequery.core.error.PulseQueryError] on failure.
     */
    open fun getResult(key: String): Result<String?> =
        runCatchingPulse { get(key) }

    /**
     * Removes the key and its associated value from storage.
     *
     * @param key Key to delete.
     */
    open fun remove(key: String) {
        val db = database
        if (db != null) {
            db.appDatabaseQueries.clearConfig(key)
        } else {
            memoryStorage.remove(key)
        }
    }

    /**
     * Safely removes the key and its associated value from storage wrapped in a [Result].
     *
     * @param key Key to delete.
     * @return [Result] containing [Unit] on success or a [io.healthplatform.pulsequery.core.error.PulseQueryError] on failure.
     */
    open fun removeResult(key: String): Result<Unit> =
        runCatchingPulse { remove(key) }
}
