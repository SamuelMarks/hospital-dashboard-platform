/**
 * @fileoverview Unit tests for KeyValueStorage session persistence and AppContainer wiring.
 */
package io.healthplatform.pulsequery.database

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import io.healthplatform.pulsequery.di.AppContainer
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Validates persistent token storage and session restoration via KeyValueStorage.
 */
class KeyValueStorageSessionTest {

    private lateinit var database: PulseQueryDatabase
    private lateinit var storage: KeyValueStorage

    @BeforeTest
    fun setup() {
        val driver = JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY)
        PulseQueryDatabase.Schema.create(driver)
        database = PulseQueryDatabase(driver)
        storage = KeyValueStorage(database)
        AppContainer.resetForTest()
        AppContainer.keyValueStorage = storage
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

    @Test
    fun testTokenPersistenceInStorage() {
        AppContainer.currentToken = "access-xyz"
        AppContainer.refreshToken = "refresh-abc"

        assertEquals("access-xyz", storage.get(AppContainer.KEY_AUTH_TOKEN))
        assertEquals("refresh-abc", storage.get(AppContainer.KEY_REFRESH_TOKEN))

        // Simulate new app launch: reset in-memory container state and reattach storage
        AppContainer.resetForTest()
        assertNull(AppContainer.currentToken)
        assertNull(AppContainer.refreshToken)

        AppContainer.keyValueStorage = storage
        assertEquals("access-xyz", AppContainer.currentToken)
        assertEquals("refresh-abc", AppContainer.refreshToken)
    }

    @Test
    fun testLogoutClearsStorage() {
        AppContainer.currentToken = "access-xyz"
        AppContainer.refreshToken = "refresh-abc"

        AppContainer.logout()

        assertNull(AppContainer.currentToken)
        assertNull(AppContainer.refreshToken)
        assertNull(storage.get(AppContainer.KEY_AUTH_TOKEN))
        assertNull(storage.get(AppContainer.KEY_REFRESH_TOKEN))
    }
}
