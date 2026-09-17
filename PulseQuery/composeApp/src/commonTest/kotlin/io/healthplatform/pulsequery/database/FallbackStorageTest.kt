/**
 * Tests verifying fallback in-memory behavior for KeyValueStorage and WidgetCacheStorage.
 */
package io.healthplatform.pulsequery.database

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Validates in-memory storage operations when native SQLDelight database is uninitialized.
 */
class FallbackStorageTest {

    @Test
    fun testKeyValueStorageInMemoryCRUD() {
        val storage = KeyValueStorage(database = null)

        assertNull(storage.get("missing_key"))

        storage.save("theme", "dark")
        assertEquals("dark", storage.get("theme"))

        storage.save("theme", "light")
        assertEquals("light", storage.get("theme"))

        storage.remove("theme")
        assertNull(storage.get("theme"))

        // Removing non-existent key should not throw
        storage.remove("missing_key")
    }

    @Test
    fun testWidgetCacheStorageInMemoryOperations() {
        val cache = WidgetCacheStorage(database = null)

        assertTrue(cache.getCachedWidgets("dash_1").isEmpty())

        cache.cacheWidget(
            widgetId = "w1",
            dashboardId = "dash_1",
            dataJson = """{"value": 42}""",
            updatedAt = 1000L
        )

        val list = cache.getCachedWidgets("dash_1")
        assertEquals(1, list.size)
        assertEquals("w1", list[0].widget_id)
        assertEquals("dash_1", list[0].dashboard_id)
        assertEquals("""{"value": 42}""", list[0].data_json)
        assertEquals(1000L, list[0].updated_at)

        // Add second widget
        cache.cacheWidget(
            widgetId = "w2",
            dashboardId = "dash_1",
            dataJson = """{"value": 99}""",
            updatedAt = 2000L
        )
        assertEquals(2, cache.getCachedWidgets("dash_1").size)

        // Clear specific widget
        cache.clearWidget("w1")
        val remaining = cache.getCachedWidgets("dash_1")
        assertEquals(1, remaining.size)
        assertEquals("w2", remaining[0].widget_id)

        // Clear dashboard widgets
        cache.clearDashboardWidgets("dash_1")
        assertTrue(cache.getCachedWidgets("dash_1").isEmpty())
    }
}
