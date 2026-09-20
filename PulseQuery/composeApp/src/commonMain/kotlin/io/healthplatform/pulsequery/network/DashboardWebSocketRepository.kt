/**
 * @fileoverview Real-Time Dashboard Collaboration Repository.
 * Manages live peer collaborator presence and widget update events.
 */
package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.di.AppContainer
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
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
)

/**
 * Repository orchestrating live peer presence and widget synchronization.
 *
 * @param httpClient Optional [HttpClient] instance for mocking.
 * @param baseUrlProvider Lambda providing the active base URL.
 * @param coroutineScope Scope managing socket lifecycle and asynchronous event dispatching.
 */
class DashboardWebSocketRepository(
    private val httpClient: HttpClient? = null,
    private val baseUrlProvider: () -> String = { AppContainer.currentBaseUrl },
    private val coroutineScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
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
    private var activeSession: DefaultClientWebSocketSession? = null

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
            try {
                val client = httpClient ?: AppContainer.httpClient
                val base = baseUrlProvider().trimEnd('/')
                val wsScheme = if (base.startsWith("https")) "wss" else "ws"
                val cleanBase = base.removePrefix("https://").removePrefix("http://")
                val wsUrl = "$wsScheme://$cleanBase/api/v1/ws/dashboards/$dashboardId?token=$token"

                runCatching {
                    client.webSocket(urlString = wsUrl) {
                        activeSession = this
                        _isConnected.value = true
                        for (frame in incoming) {
                            if (frame is Frame.Text) {
                                val text = frame.readText()
                                runCatching {
                                    json.decodeFromString<CollaborationEvent>(text)
                                }.onSuccess { event ->
                                    when (event.type) {
                                        "USER_JOINED", "USER_LEFT" -> {
                                            if (event.activeUsers.isNotEmpty()) {
                                                _activeCollaborators.value = event.activeUsers
                                            }
                                        }
                                        "WIDGET_UPDATED" -> {
                                            event.widgetId?.let { _remoteWidgetUpdates.emit(it) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } finally {
                _isConnected.value = false
                activeSession = null
            }
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
            runCatching {
                val dq = 34.toChar()
                val jsonMsg = "{$dq" + "type$dq:$dq" + "WIDGET_UPDATED$dq,$dq" + "widget_id$dq:$dq" + "$widgetId$dq}"
                session.send(Frame.Text(jsonMsg))
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
        if (!_remoteWidgetUpdates.tryEmit(widgetId)) {
            coroutineScope.launch {
                _remoteWidgetUpdates.emit(widgetId)
            }
        }
    }
}
