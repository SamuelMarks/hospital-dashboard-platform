/**
 * @fileoverview Unit tests for QueryCartRepository.
 */
package io.healthplatform.pulsequery.network

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Validates query cart staging, removal, and clearing operations.
 */
class QueryCartRepositoryTest {

    @Test
    fun testInitialCartEmpty() {
        val repo = QueryCartRepository()
        assertTrue(repo.stagedQueries.value.isEmpty())
    }

    @Test
    fun testAddAndRemoveQuery() {
        val repo = QueryCartRepository()
        val q1 = repo.addQuery("ER Admissions", "SELECT COUNT(*) FROM admissions", "metric")
        assertEquals(1, repo.stagedQueries.value.size)
        assertEquals("ER Admissions", q1.title)
        assertEquals("metric", q1.visualization)

        val q2 = repo.addQuery("Bed Occupancy", "SELECT * FROM beds", "table")
        assertEquals(2, repo.stagedQueries.value.size)

        repo.removeQuery(q1.id)
        assertEquals(1, repo.stagedQueries.value.size)
        assertEquals(q2.id, repo.stagedQueries.value[0].id)

        repo.clearCart()
        assertTrue(repo.stagedQueries.value.isEmpty())
    }
}
