/**
 * @fileoverview Query Cart Repository for staging ad-hoc clinical queries.
 * Enables clinicians and analysts to capture SQL queries from Chat Arena
 * or Exploration views and pin them directly to dashboards.
 */
package io.healthplatform.pulsequery.network

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

/**
 * Represents an ad-hoc query staged in the user's mobile cart.
 *
 * @property id Unique staging identifier.
 * @property title Human-readable label for the staged widget.
 * @property sql The SQL analytical query string.
 * @property visualization Target chart/table visualization type.
 * @property addedAt Epoch timestamp when the query was staged.
 */
@Serializable
data class StagedQuery(
    val id: String,
    val title: String,
    val sql: String,
    val visualization: String = "table",
    val addedAt: Long = 0L
)

/**
 * In-memory repository managing the clinician's active query cart session.
 */
class QueryCartRepository {

    private val _stagedQueries = MutableStateFlow<List<StagedQuery>>(emptyList())
    /** StateFlow emitting the currently staged queries in the cart. */
    val stagedQueries: StateFlow<List<StagedQuery>> = _stagedQueries.asStateFlow()

    /**
     * Stages a new SQL query in the cart.
     *
     * @param title Title for the staged query.
     * @param sql Analytical SQL string.
     * @param visualization Preferred visualization type (defaults to 'table').
     * @return The created [StagedQuery] entity.
     */
    fun addQuery(title: String, sql: String, visualization: String = "table"): StagedQuery {
        val query = StagedQuery(
            id = "cart-" + (_stagedQueries.value.size + 1),
            title = title,
            sql = sql,
            visualization = visualization,
            addedAt = 1000L
        )
        _stagedQueries.value = _stagedQueries.value + query
        return query
    }

    /**
     * Removes a staged query by its identifier.
     *
     * @param id Staged query identifier.
     */
    fun removeQuery(id: String) {
        _stagedQueries.value = _stagedQueries.value.filterNot { it.id == id }
    }

    /**
     * Clears all queries from the active cart.
     */
    fun clearCart() {
        _stagedQueries.value = emptyList()
    }
}
