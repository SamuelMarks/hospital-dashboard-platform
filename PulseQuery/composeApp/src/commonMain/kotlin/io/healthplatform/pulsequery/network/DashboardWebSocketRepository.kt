/**
 * Real-Time Dashboard Collaboration Repository.
 * Manages live peer collaborator presence and widget update events.
 */
package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.core.result.runCatchingPulse
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.websocket.Frame
import io.ktor.websocket.WebSocketSession
import io.ktor.websocket.readText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Collaborator user profile received via real-time presence broadcast.
 *
 * @property userId Unique identifier of the collaborator.
 * @property email Collaborator email address.
 * @property role Clinical or administrative role.
 * @property connectedAt ISO timestamp when the session began.
 */
@Serializable
data class CollaboratorPresence(
    @SerialName("user_id")
    val userId: String = "",
    val email: String = "",
    val role: String = "",
    @SerialName("connected_at")
    val connectedAt: String = ""
)

/**
 * Enumerated discriminator types for real-time WebSocket collaboration events.
 *
 * @property wireValue Raw wire event discriminator string.
 */
@Serializable
enum class CollaborationEventType(val wireValue: String) {
    /** A peer collaborator joined the dashboard session. */
    @SerialName("USER_JOINED")
    USER_JOINED("USER_JOINED"),

    /** A peer collaborator left the dashboard session. */
    @SerialName("USER_LEFT")
    USER_LEFT("USER_LEFT"),

    /** A widget configuration or query was updated by a peer. */
    @SerialName("WIDGET_UPDATED")
    WIDGET_UPDATED("WIDGET_UPDATED"),

    /** Unrecognized collaboration event type. */
    @SerialName("UNKNOWN")
    UNKNOWN("UNKNOWN");

    /**
     * Companion utilities for resolving [CollaborationEventType] from raw wire strings.
     */
    companion object {
        /**
         * Resolves a [CollaborationEventType] from [raw], defaulting to [UNKNOWN].
         *
         * @param raw Raw event discriminator string.
         * @return Matching [CollaborationEventType].
         */
        fun fromWire(raw: String): CollaborationEventType =
            entries.firstOrNull { it.wireValue.equals(raw, ignoreCase = true) } ?: UNKNOWN
    }
}

/**
 * Inbound real-time collaboration event structure.
 *
 * @property type Action type string (e.g. USER_JOINED, USER_LEFT, WIDGET_UPDATED).
 * @property user Individual collaborator profile.
 * @property activeUsers List of all currently online collaborators.
 * @property widgetId Target widget ID if event is a widget refresh.
 */
@Serializable
data class CollaborationEvent(
    val type: String,
    val user: CollaboratorPresence? = null,
    @SerialName("active_users")
    val activeUsers: List<CollaboratorPresence> = emptyList(),
    @SerialName("widget_id")
    val widgetId: String? = null
) {
    /** Strongly typed [CollaborationEventType] resolved from [type]. */
    val eventType: CollaborationEventType
        get() = CollaborationEventType.fromWire(type)
}

/**
 * Minimal WebSocket session abstraction used by [DashboardWebSocketRepository]
 * to receive incoming frames and send outgoing text messages.
 */
interface CollaborationSocketSession {
    /** Channel of incoming WebSocket frames from the server. */
    val incoming: ReceiveChannel<Frame>

    /**
     * Sends a raw text payload over the active WebSocket connection.
     *
     * @param text Serialized JSON message to transmit.
     */
    suspend fun sendText(text: String)
}

/**
 * Wraps a Ktor [WebSocketSession] as a [CollaborationSocketSession].
 */
fun WebSocketSession.asCollaborationSocketSession(): CollaborationSocketSession {
    val delegate = this
    return object : CollaborationSocketSession {
        override val incoming: ReceiveChannel<Frame>
            get() = delegate.incoming

        override suspend fun sendText(text: String) {
            delegate.send(Frame.Text(text))
        }
    }
}

/**
 * Repository orchestrating live peer presence and widget synchronization.
 *
 * @param httpClient Optional [HttpClient] instance for mocking.
 * @param baseUrlProvider Lambda providing the active base URL.
 * @param coroutineScope Scope managing socket lifecycle and asynchronous event dispatching.
 * @param sessionFactory Factory opening a [CollaborationSocketSession] for a resolved URL.
 */
class DashboardWebSocketRepository(
    private val httpClient: HttpClient? = null,
    private val baseUrlProvider: () -> String = { AppContainer.currentBaseUrl },
    private val coroutineScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    private val sessionFactory: suspend (HttpClient, String) -> CollaborationSocketSession =
        { client, url -> client.webSocketSession(urlString = url).asCollaborationSocketSession() }
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private val _activeCollaborators = MutableStateFlow<List<CollaboratorPresence>>(emptyList())
    /** StateFlow emitting currently connected collaborator profiles. */
    val activeCollaborators: StateFlow<List<CollaboratorPresence>> = _activeCollaborators.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    /** StateFlow indicating if real-time collaboration channel is active. */
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _remoteWidgetUpdates = MutableSharedFlow<String>(replay = 1, extraBufferCapacity = 16)
    /** SharedFlow emitting widget IDs triggered for refresh by remote peers. */
    val remoteWidgetUpdates: SharedFlow<String> = _remoteWidgetUpdates.asSharedFlow()

    private var activeDashboardId: String? = null
    private var sessionJob: Job? = null
    private var activeSession: CollaborationSocketSession? = null

    /**
     * Connects to collaboration session for target dashboard.
     *
     * @param dashboardId UUID of the dashboard to observe.
     * @param token Active user authentication JWT.
     */
    fun connect(dashboardId: String, token: String?) {
        if (token.isNullOrBlank()) return
        disconnect()
        activeDashboardId = dashboardId

        sessionJob = coroutineScope.launch {
            val client = httpClient ?: AppContainer.httpClient
            val wsUrl = buildWebSocketUrl(dashboardId, token)
            runCatchingPulseAsync {
                val session = sessionFactory(client, wsUrl)
                listenToWebSocketSession(session)
            }
            _isConnected.value = false
            activeSession = null
        }
    }

    /**
     * Constructs the target WebSocket URL from the base HTTP/HTTPS URL.
     *
     * @param dashboardId Target dashboard UUID.
     * @param token Authentication bearer token.
     * @return Formatted `ws://` or `wss://` URL string.
     */
    fun buildWebSocketUrl(dashboardId: String, token: String): String {
        val base = baseUrlProvider().trimEnd('/')
        val wsScheme = if (base.startsWith("https")) "wss" else "ws"
        val cleanBase = base.removePrefix("https://").removePrefix("http://")
        return "$wsScheme://$cleanBase/api/v1/ws/dashboards/$dashboardId?token=$token"
    }

    /**
     * Consumes incoming frames from an active [CollaborationSocketSession] until closed.
     *
     * @param session Active WebSocket session.
     */
    private suspend fun listenToWebSocketSession(session: CollaborationSocketSession) {
        activeSession = session
        _isConnected.value = true
        for (frame in session.incoming) {
            if (frame is Frame.Text) {
                handleIncomingTextFrame(frame.readText())
            }
        }
    }

    /**
     * Decodes a raw WebSocket text frame into a [CollaborationEvent] via [Result] and updates state flows.
     *
     * @param text Raw JSON text frame received from the WebSocket channel.
     */
    private suspend fun handleIncomingTextFrame(text: String) {
        val event = runCatchingPulse { json.decodeFromString<CollaborationEvent>(text) }.getOrNull() ?: return
        when (event.eventType) {
            CollaborationEventType.USER_JOINED, CollaborationEventType.USER_LEFT -> {
                if (event.activeUsers.isNotEmpty()) {
                    _activeCollaborators.value = event.activeUsers
                }
            }
            CollaborationEventType.WIDGET_UPDATED -> {
                event.widgetId?.let { _remoteWidgetUpdates.emit(it) }
            }
            CollaborationEventType.UNKNOWN -> Unit
        }
    }

    /**
     * Dispatches a remote widget refresh signal to remote peers across the WebSocket session.
     *
     * @param widgetId Unique ID of the updated widget.
     */
    suspend fun sendWidgetUpdate(widgetId: String) {
        val session = activeSession
        if (session != null) {
            runCatchingPulseAsync {
                val jsonMsg = json.encodeToString(
                    CollaborationEvent(
                        type = CollaborationEventType.WIDGET_UPDATED.wireValue,
                        widgetId = widgetId
                    )
                )
                session.sendText(jsonMsg)
            }
        } else {
            _remoteWidgetUpdates.emit(widgetId)
        }
    }

    /**
     * Disconnects active collaboration session and clears presence state.
     */
    fun disconnect() {
        activeDashboardId = null
        sessionJob?.cancel()
        sessionJob = null
        activeSession = null
        _isConnected.value = false
        _activeCollaborators.value = emptyList()
    }

    /**
     * Updates active collaborators in response to socket presence event.
     *
     * @param collaborators Latest active collaborator list.
     */
    fun updateCollaborators(collaborators: List<CollaboratorPresence>) {
        _activeCollaborators.value = collaborators
    }

    /**
     * Dispatches a remote widget refresh signal to observing screens.
     *
     * @param widgetId Unique ID of updated widget.
     */
    fun onRemoteWidgetUpdate(widgetId: String) {
        _remoteWidgetUpdates.tryEmit(widgetId)
    }
}
