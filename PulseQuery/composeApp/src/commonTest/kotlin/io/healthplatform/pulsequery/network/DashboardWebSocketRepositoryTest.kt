/**
 * @fileoverview Unit tests for DashboardWebSocketRepository.
 */
package io.healthplatform.pulsequery.network

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Validates collaboration repository presence and event dispatch logic.
 */
class DashboardWebSocketRepositoryTest {

    @Test
    fun testInitialState() {
        val repo = DashboardWebSocketRepository()
        assertFalse(repo.isConnected.value)
        assertTrue(repo.activeCollaborators.value.isEmpty())
    }

    @Test
    fun testConnectWithBlankTokenIgnored() {
        val repo = DashboardWebSocketRepository()
        repo.connect("dash-1", null)
        assertFalse(repo.isConnected.value)

        repo.connect("dash-1", "   ")
        assertFalse(repo.isConnected.value)
    }

    @Test
    fun testCollaboratorsAndDisconnectLifecycle() {
        val repo = DashboardWebSocketRepository()

        val peers = listOf(
            CollaboratorPresence(
                userId = "u1",
                email = "clinician@hospital.org",
                role = "ATTENDING_PHYSICIAN",
                connectedAt = "2026-09-15T00:00:00Z"
            )
        )
        repo.updateCollaborators(peers)
        assertEquals(1, repo.activeCollaborators.value.size)
        assertEquals("clinician@hospital.org", repo.activeCollaborators.value[0].email)
        assertEquals("ATTENDING_PHYSICIAN", repo.activeCollaborators.value[0].role)

        repo.disconnect()
        assertFalse(repo.isConnected.value)
        assertTrue(repo.activeCollaborators.value.isEmpty())
    }

    @Test
    fun testRemoteWidgetUpdateEmission() = runTest {
        val repo = DashboardWebSocketRepository()
        repo.sendWidgetUpdate("widget-42")
        val emitted = repo.remoteWidgetUpdates.first()
        assertEquals("widget-42", emitted)
    }

    @Test
    fun testOnRemoteWidgetUpdateEmission() = runTest {
        val repo = DashboardWebSocketRepository()
        repo.onRemoteWidgetUpdate("widget-99")
        var result: String? = null
        for (i in 0..30) {
            result = repo.remoteWidgetUpdates.replayCache.firstOrNull()
            if (result != null) break
            kotlinx.coroutines.delay(10)
        }
        assertEquals("widget-99", result)
    }

    @Test
    fun testCollaborationEventDataModel() {
        val peer = CollaboratorPresence(userId = "u2", email = "test@doc.org", role = "NURSE", connectedAt = "now")
        val event = CollaborationEvent(
            type = "USER_JOINED",
            user = peer,
            activeUsers = listOf(peer),
            widgetId = "w1"
        )
        assertEquals("USER_JOINED", event.type)
        assertEquals("u2", event.user?.userId)
        assertEquals(1, event.activeUsers.size)
        assertEquals("w1", event.widgetId)
    }
}
