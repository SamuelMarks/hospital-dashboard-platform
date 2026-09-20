/**
 * Widget Cache Storage module for offline query snapshots in Pulse Query.
 */
package io.healthplatform.pulsequery.database

import kotlin.time.Clock

/**
 * Cache storage for widget query snapshots to support offline viewing in KMP.
 * Backed by SQLDelight database when initialized, with in-memory fallback for platforms
 * without an active SQLite driver.
 *
 * @property database Optional SQLDelight database instance containing database queries.
 */
class WidgetCacheStorage(private val database: PulseQueryDatabase? = null) {
    private val memoryWidgets: MutableMap<String, MutableMap<String, CachedWidget>> = mutableMapOf()

    /**
     * Persists or updates the cached JSON snapshot of a widget.
     *
     * @param widgetId Unique ID of the widget.
     * @param dashboardId ID of the parent dashboard.
     * @param dataJson Serialized JSON payload of the widget's query results or configuration.
     * @param updatedAt Epoch milliseconds when the cache entry was created or updated.
     */
    fun cacheWidget(
        widgetId: String,
        dashboardId: String,
        dataJson: String,
        updatedAt: Long = Clock.System.now().toEpochMilliseconds()
    ) {
        val db = database
        if (db != null) {
            db.appDatabaseQueries.insertCachedWidget(
                widget_id = widgetId,
                dashboard_id = dashboardId,
                data_json = dataJson,
                updated_at = updatedAt
            )
        } else {
            val map = memoryWidgets.getOrPut(dashboardId) { mutableMapOf() }
            map[widgetId] = CachedWidget(
                widget_id = widgetId,
                dashboard_id = dashboardId,
                data_json = dataJson,
                updated_at = updatedAt
            )
        }
    }

    /**
     * Retrieves all cached widget entries for a specific dashboard.
     *
     * @param dashboardId ID of the dashboard.
     * @return List of [CachedWidget] items associated with the dashboard.
     */
    fun getCachedWidgets(dashboardId: String): List<CachedWidget> {
        val db = database
        return if (db != null) {
            db.appDatabaseQueries.getCachedWidgetsForDashboard(dashboardId).executeAsList()
        } else {
            val widgets = memoryWidgets[dashboardId]
            if (widgets != null) widgets.values.toList() else emptyList()
        }
    }

    /**
     * Deletes all cached widgets for a specific dashboard.
     *
     * @param dashboardId ID of the dashboard whose cached widgets should be removed.
     */
    fun clearDashboardWidgets(dashboardId: String) {
        val db = database
        if (db != null) {
            db.appDatabaseQueries.deleteCachedWidgetsForDashboard(dashboardId)
        } else {
            memoryWidgets.remove(dashboardId)
        }
    }

    /**
     * Deletes a single cached widget entry.
     *
     * @param widgetId ID of the widget to delete from cache.
     */
    fun clearWidget(widgetId: String) {
        val db = database
        if (db != null) {
            db.appDatabaseQueries.deleteCachedWidget(widgetId)
        } else {
            for (map in memoryWidgets.values) {
                map.remove(widgetId)
            }
        }
    }
}
