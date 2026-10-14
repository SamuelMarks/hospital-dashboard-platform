/**
 * @fileoverview Unit tests for DashboardWebSocketRepository.
 */
package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import io.ktor.websocket.Frame
import io.ktor.websocket.WebSocketExtension
import io.ktor.websocket.WebSocketSession
import io.ktor.websocket.readText
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.channels.SendChannel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Validates collaboration repository presence and event dispatch logic.
 */
class DashboardWebSocketRepositoryTest {

    @BeforeTest
    fun setUp() {
        AppContainer.resetForTest()
        AppContainer.currentBaseUrl = "http://localhost"
    }

    @AfterTest
    fun tearDown() {
        AppContainer.resetForTest()
    }

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
    fun testBuildWebSocketUrlHttpAndHttps() {
        val httpRepo = DashboardWebSocketRepository(baseUrlProvider = { "http://localhost:8000/" })
        assertEquals(
            "ws://localhost:8000/api/v1/ws/dashboards/d-1?token=tok",
            httpRepo.buildWebSocketUrl("d-1", "tok")
        )

        val httpsRepo = DashboardWebSocketRepository(baseUrlProvider = { "https://api.hospital.org/" })
        assertEquals(
            "wss://api.hospital.org/api/v1/ws/dashboards/d-2?token=sec",
            httpsRepo.buildWebSocketUrl("d-2", "sec")
        )
    }

    @Test
    fun testConnectAndDefaultSessionConnectorAndIncomingFrames(): Unit = kotlinx.coroutines.runBlocking {
        // 1. Default sessionConnector against a standard MockEngine (fails gracefully inside runCatching)
        val mockClient = HttpClient(MockEngine { respond("No WS", HttpStatusCode.BadRequest) })
        AppContainer.setHttpClientForTest(mockClient)
        val defaultRepo = DashboardWebSocketRepository(httpClient = null, coroutineScope = this)
        defaultRepo.connect("dash-default", "jwt")
        kotlinx.coroutines.delay(50)
        assertFalse(defaultRepo.isConnected.value)

        // 2. Test WebSocketSession.asCollaborationSocketSession() directly
        val rawIncoming = Channel<Frame>(Channel.UNLIMITED)
        val rawOutgoing = Channel<Frame>(Channel.UNLIMITED)
        val fakeWsSession = object : WebSocketSession {
            override val coroutineContext: CoroutineContext = EmptyCoroutineContext
            override val extensions: List<WebSocketExtension<*>> = emptyList()
            override val incoming: ReceiveChannel<Frame> = rawIncoming
            override var maxFrameSize: Long = Long.MAX_VALUE
            override var masking: Boolean = false
            override val outgoing: SendChannel<Frame> = rawOutgoing
            override suspend fun flush() = Unit
            @Deprecated("Use cancel() instead.", ReplaceWith("cancel()"))
            override fun terminate() = Unit
        }
        val wrappedSession = fakeWsSession.asCollaborationSocketSession()
        rawIncoming.trySend(Frame.Text("hello"))
        assertEquals("hello", (wrappedSession.incoming.receive() as Frame.Text).readText())
        wrappedSession.sendText("world")
        assertEquals("world", (rawOutgoing.receive() as Frame.Text).readText())

        // 3. Full active session lifecycle with incoming text & non-text frames and outgoing sendWidgetUpdate
        val sessionIncoming = Channel<Frame>(Channel.UNLIMITED)
        val sentMessages = mutableListOf<String>()
        var connectedUrl: String? = null
        val customSession = object : CollaborationSocketSession {
            override val incoming: ReceiveChannel<Frame> = sessionIncoming
            override suspend fun sendText(text: String) {
                sentMessages.add(text)
            }
        }
        val repo = DashboardWebSocketRepository(
            httpClient = mockClient,
            baseUrlProvider = { "https://localhost" },
            coroutineScope = this,
            sessionFactory = { _, url ->
                connectedUrl = url
                customSession
            }
        )

        repo.connect("dash-live", "token-123")
        for (i in 0..40) {
            if (repo.isConnected.value) break
            kotlinx.coroutines.delay(10)
        }
        assertTrue(repo.isConnected.value)
        assertEquals("wss://localhost/api/v1/ws/dashboards/dash-live?token=token-123", connectedUrl)

        // Non-Text frame is ignored
        sessionIncoming.send(Frame.Binary(true, byteArrayOf(1, 2, 3)))
        // Invalid JSON is ignored
        sessionIncoming.send(Frame.Text("not-json"))
        // Unknown event type is ignored
        sessionIncoming.send(Frame.Text("""{"type":"PING"}"""))
        // USER_JOINED with empty activeUsers does not overwrite
        sessionIncoming.send(Frame.Text("""{"type":"USER_JOINED","active_users":[]}"""))
        // USER_JOINED with non-empty activeUsers updates activeCollaborators
        sessionIncoming.send(
            Frame.Text(
                """{"type":"USER_JOINED","active_users":[{"user_id":"u1","email":"a@b.c","role":"ADMIN","connected_at":"now"}]}"""
            )
        )
        // USER_LEFT with non-empty activeUsers updates activeCollaborators
        sessionIncoming.send(
            Frame.Text(
                """{"type":"USER_LEFT","active_users":[{"user_id":"u2","email":"d@e.f","role":"NURSE","connected_at":"now"}]}"""
            )
        )
        // WIDGET_UPDATED with null widgetId is ignored
        sessionIncoming.send(Frame.Text("""{"type":"WIDGET_UPDATED","widget_id":null}"""))
        // WIDGET_UPDATED with non-null widgetId emits to remoteWidgetUpdates
        sessionIncoming.send(Frame.Text("""{"type":"WIDGET_UPDATED","widget_id":"w-updated"}"""))

        for (i in 0..40) {
            if (repo.activeCollaborators.value.firstOrNull()?.userId == "u2" &&
                repo.remoteWidgetUpdates.replayCache.contains("w-updated")
            ) {
                break
            }
            kotlinx.coroutines.delay(10)
        }
        assertEquals("u2", repo.activeCollaborators.value.first().userId)
        assertEquals("w-updated", repo.remoteWidgetUpdates.first())

        // sendWidgetUpdate while connected sends over session
        repo.sendWidgetUpdate("w-outbound")
        assertEquals(1, sentMessages.size)
        assertTrue(sentMessages.first().contains("w-outbound"))

        // Close incoming channel so listenToWebSocketSession finishes and triggers finally block
        sessionIncoming.close()
        for (i in 0..40) {
            if (!repo.isConnected.value) break
            kotlinx.coroutines.delay(10)
        }
        assertFalse(repo.isConnected.value)

        // Reconnect and then explicitly disconnect while sessionJob is active
        val neverClosingChannel = Channel<Frame>(Channel.UNLIMITED)
        val repoActiveCancel = DashboardWebSocketRepository(
            httpClient = mockClient,
            coroutineScope = this,
            sessionFactory = { _, _ ->
                object : CollaborationSocketSession {
                    override val incoming: ReceiveChannel<Frame> = neverClosingChannel
                    override suspend fun sendText(text: String) = Unit
                }
            }
        )
        repoActiveCancel.connect("dash-cancel", "tok")
        for (i in 0..40) {
            if (repoActiveCancel.isConnected.value) break
            kotlinx.coroutines.delay(10)
        }
        assertTrue(repoActiveCancel.isConnected.value)
        repoActiveCancel.disconnect()
        assertFalse(repoActiveCancel.isConnected.value)
        neverClosingChannel.close()
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
        val result = repo.remoteWidgetUpdates.first()
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
