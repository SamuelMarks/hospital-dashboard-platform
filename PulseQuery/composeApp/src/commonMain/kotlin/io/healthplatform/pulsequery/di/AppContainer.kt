/**
 * Dependency Injection container and immutable API service registry for PulseQuery.
 */
package io.healthplatform.pulsequery.di

import io.healthplatform.pulsequery.api.apis.AdminApi
import io.healthplatform.pulsequery.api.apis.AdminUsersApi
import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.api.apis.AlertRulesApi
import io.healthplatform.pulsequery.api.apis.AnalyticsApi
import io.healthplatform.pulsequery.api.apis.AuthApi
import io.healthplatform.pulsequery.api.apis.BenchmarksApi
import io.healthplatform.pulsequery.api.apis.ChatApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.ExecutionApi
import io.healthplatform.pulsequery.api.apis.MpaxArenaApi
import io.healthplatform.pulsequery.api.apis.SchemaApi
import io.healthplatform.pulsequery.api.apis.SimulationApi
import io.healthplatform.pulsequery.api.apis.SystemApi
import io.healthplatform.pulsequery.api.apis.TemplatesApi
import io.healthplatform.pulsequery.api.models.RefreshTokenRequest
import io.healthplatform.pulsequery.api.models.UserResponse
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.core.result.asResult
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.core.result.valueOrNull
import io.healthplatform.pulsequery.database.DatabaseDriverFactory
import io.healthplatform.pulsequery.database.KeyValueStorage
import io.healthplatform.pulsequery.database.PulseQueryDatabase
import io.healthplatform.pulsequery.database.WidgetCacheStorage
import io.healthplatform.pulsequery.database.createDatabaseResult
import io.healthplatform.pulsequery.getDefaultLocalHost
import io.healthplatform.pulsequery.network.ChatStreamingRepository
import io.healthplatform.pulsequery.network.DashboardWebSocketRepository
import io.healthplatform.pulsequery.network.NetworkHealthRepository
import io.healthplatform.pulsequery.network.QueryCartRepository
import io.healthplatform.pulsequery.network.createHttpClient
import io.ktor.client.HttpClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Immutable snapshot of the active user authentication session.
 *
 * @property accessToken Active JWT access token, or null if unauthenticated.
 * @property refreshToken Active JWT refresh token, or null if unavailable.
 * @property user Authenticated [UserResponse] profile, or null if unauthenticated.
 */
data class AuthSessionState(
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val user: UserResponse? = null
) {
    /** True when a non-blank [accessToken] is present. */
    val isAuthenticated: Boolean
        get() = !accessToken.isNullOrBlank()
}

/**
 * Reactive session state manager encapsulating JWT token persistence and [AuthSessionState] updates.
 */
class AuthSessionManager {
    private val _sessionState = MutableStateFlow(AuthSessionState())

    /** Reactive [StateFlow] of the current [AuthSessionState]. */
    val sessionState: StateFlow<AuthSessionState> = _sessionState.asStateFlow()

    /** Updates the active access token and synchronizes with optional [storage]. */
    fun updateAccessToken(token: String?, storage: KeyValueStorage?) {
        _sessionState.update { it.copy(accessToken = token) }
        if (token != null) {
            storage?.saveResult(AppContainer.KEY_AUTH_TOKEN, token)
        } else {
            storage?.removeResult(AppContainer.KEY_AUTH_TOKEN)
        }
    }

    /** Updates the active refresh token and synchronizes with optional [storage]. */
    fun updateRefreshToken(token: String?, storage: KeyValueStorage?) {
        _sessionState.update { it.copy(refreshToken = token) }
        if (token != null) {
            storage?.saveResult(AppContainer.KEY_REFRESH_TOKEN, token)
        } else {
            storage?.removeResult(AppContainer.KEY_REFRESH_TOKEN)
        }
    }

    /** Updates the active authenticated [UserResponse]. */
    fun updateUser(user: UserResponse?) {
        _sessionState.update { it.copy(user = user) }
    }

    /** Restores persisted tokens from [storage] when no active token is in memory. */
    fun restoreFromStorage(storage: KeyValueStorage) {
        if (_sessionState.value.accessToken == null) {
            _sessionState.update {
                it.copy(
                    accessToken = storage.getResult(AppContainer.KEY_AUTH_TOKEN).valueOrNull(),
                    refreshToken = storage.getResult(AppContainer.KEY_REFRESH_TOKEN).valueOrNull()
                )
            }
        }
    }

    /** Clears all in-memory and persisted session state. */
    fun clear(storage: KeyValueStorage?) {
        storage?.removeResult(AppContainer.KEY_AUTH_TOKEN)
        storage?.removeResult(AppContainer.KEY_REFRESH_TOKEN)
        _sessionState.value = AuthSessionState()
    }
}

/**
 * Contract defining all backend API clients and network repositories provided by the DI container.
 */
interface AppDependencies {
    /** Active Ktor [HttpClient] instance. */
    val httpClient: HttpClient

    /** Client for authentication endpoints. */
    val authApi: AuthApi

    /** Client for dashboard layout and widget persistence endpoints. */
    val dashboardsApi: DashboardsApi

    /** Client for conversational AI chat and SQL generation endpoints. */
    val chatApi: ChatApi

    /** Client for analytical report queries. */
    val analyticsApi: AnalyticsApi

    /** Client for MPAX capacity simulation endpoints. */
    val simulationApi: SimulationApi

    /** Client for admin configuration endpoints. */
    val adminApi: AdminApi

    /** Client for admin user management endpoints (listing, roles, active status). */
    val adminUsersApi: AdminUsersApi

    /** Client for LLM model discovery and arena queries. */
    val aiApi: AiApi

    /** Client for analytical database catalog schemas. */
    val schemaApi: SchemaApi

    /** Client for widget template marketplace endpoints. */
    val templatesApi: TemplatesApi

    /** Client for widget analytical query execution endpoints. */
    val executionApi: ExecutionApi

    /** Client for system diagnostics and health endpoints. */
    val systemApi: SystemApi

    /** Client for SQL and MPAX benchmark query endpoints. */
    val benchmarksApi: BenchmarksApi

    /** Client for multi-candidate MPAX Arena competitive evaluation endpoints. */
    val mpaxArenaApi: MpaxArenaApi

    /** Client for hospital capacity alerting thresholds and alert rules endpoints. */
    val alertRulesApi: AlertRulesApi

    /** Repository managing live WebSocket collaboration and collaborator presence. */
    val dashboardWebSocketRepository: DashboardWebSocketRepository

    /** Repository managing live Server-Sent Events chat token streaming. */
    val chatStreamingRepository: ChatStreamingRepository

    /** Repository monitoring backend health and reachability. */
    val networkHealthRepository: NetworkHealthRepository
}

/**
 * Immutable registry encapsulating all generated OpenAPI clients and network repositories
 * bound to a specific [baseUrl] and lazy [httpClientProvider].
 *
 * @property baseUrl Base URL of the Pulse Query backend API.
 * @property httpClientProvider Lazy factory providing the Ktor [HttpClient] instance used by all API services.
 */
class ApiServiceRegistry(
    val baseUrl: String,
    private val httpClientProvider: () -> HttpClient
) : AppDependencies {
    /** Active Ktor [HttpClient] instance resolved lazily on first network access. */
    override val httpClient: HttpClient by lazy { httpClientProvider() }

    /** Secondary constructor accepting an already-created [HttpClient] instance. */
    constructor(baseUrl: String, httpClient: HttpClient) : this(
        baseUrl = baseUrl,
        httpClientProvider = { httpClient }
    )
    /** Client for authentication endpoints. */
    override val authApi: AuthApi by lazy { AuthApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for dashboard layout and widget persistence endpoints. */
    override val dashboardsApi: DashboardsApi by lazy { DashboardsApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for conversational AI chat and SQL generation endpoints. */
    override val chatApi: ChatApi by lazy { ChatApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for analytical report queries. */
    override val analyticsApi: AnalyticsApi by lazy { AnalyticsApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for MPAX capacity simulation endpoints. */
    override val simulationApi: SimulationApi by lazy { SimulationApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for admin configuration endpoints. */
    override val adminApi: AdminApi by lazy { AdminApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for admin user management endpoints (listing, roles, active status). */
    override val adminUsersApi: AdminUsersApi by lazy { AdminUsersApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for LLM model discovery and arena queries. */
    override val aiApi: AiApi by lazy { AiApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for analytical database catalog schemas. */
    override val schemaApi: SchemaApi by lazy { SchemaApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for widget template marketplace endpoints. */
    override val templatesApi: TemplatesApi by lazy { TemplatesApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for widget analytical query execution endpoints. */
    override val executionApi: ExecutionApi by lazy { ExecutionApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for system diagnostics and health endpoints. */
    override val systemApi: SystemApi by lazy { SystemApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for SQL and MPAX benchmark query endpoints. */
    override val benchmarksApi: BenchmarksApi by lazy { BenchmarksApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for multi-candidate MPAX Arena competitive evaluation endpoints. */
    override val mpaxArenaApi: MpaxArenaApi by lazy { MpaxArenaApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for hospital capacity alerting thresholds and alert rules endpoints. */
    override val alertRulesApi: AlertRulesApi by lazy { AlertRulesApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Repository managing live WebSocket collaboration and collaborator presence. */
    override val dashboardWebSocketRepository: DashboardWebSocketRepository by lazy {
        DashboardWebSocketRepository(httpClient = httpClient, baseUrlProvider = { baseUrl })
    }

    /** Repository managing live Server-Sent Events chat token streaming. */
    override val chatStreamingRepository: ChatStreamingRepository by lazy {
        ChatStreamingRepository(httpClient = httpClient, baseUrlProvider = { baseUrl })
    }

    /** Repository monitoring backend health and reachability. */
    override val networkHealthRepository: NetworkHealthRepository by lazy {
        NetworkHealthRepository(systemApi = systemApi)
    }
}

/**
 * Lightweight Dependency Injection container for PulseQuery.
 * Holds an immutable [ApiServiceRegistry] in a [StateFlow] and manages session persistence.
 */
object AppContainer : AppDependencies {

    /** Storage key for the active JWT access token. */
    const val KEY_AUTH_TOKEN: String = "pulse_auth_token"

    /** Storage key for the active JWT refresh token. */
    const val KEY_REFRESH_TOKEN: String = "pulse_refresh_token"

    /** Reactive session manager holding [AuthSessionState]. */
    val sessionManager: AuthSessionManager = AuthSessionManager()

    /** Reactive [StateFlow] of the current [AuthSessionState]. */
    val sessionState: StateFlow<AuthSessionState>
        get() = sessionManager.sessionState

    private var _keyValueStorage: KeyValueStorage? = null

    /** Simple key-value storage backed by SQLDelight database. */
    var keyValueStorage: KeyValueStorage?
        get() = _keyValueStorage
        set(value) {
            _keyValueStorage = value
            if (value != null) {
                sessionManager.restoreFromStorage(value)
            }
        }

    /** Cache storage for offline widget query snapshots. */
    var widgetCacheStorage: WidgetCacheStorage? = null

    /**
     * Initializes the database, key-value storage, and widget cache storage
     * using the supplied platform-specific driver factory.
     *
     * @param driverFactory Factory providing the platform SQLite driver.
     * @return [Result] containing the initialized [PulseQueryDatabase] or a [PulseQueryError].
     */
    fun initDatabase(driverFactory: DatabaseDriverFactory): Result<PulseQueryDatabase> {
        val result = createDatabaseResult(driverFactory)
        result.valueOrNull()?.let { database ->
            keyValueStorage = KeyValueStorage(database)
            widgetCacheStorage = WidgetCacheStorage(database)
        }
        return result
    }

    /** Repository for staging ad-hoc clinical queries in mobile query cart. */
    val queryCartRepository: QueryCartRepository = QueryCartRepository()

    /**
     * Stores the current auth token across the session, persisting to [KeyValueStorage] if present.
     */
    var currentToken: String?
        get() = sessionManager.sessionState.value.accessToken
        set(value) {
            sessionManager.updateAccessToken(value, _keyValueStorage)
        }

    /**
     * Stores the current refresh token across the session, persisting to [KeyValueStorage] if present.
     */
    var refreshToken: String?
        get() = sessionManager.sessionState.value.refreshToken
        set(value) {
            sessionManager.updateRefreshToken(value, _keyValueStorage)
        }

    /**
     * Stores the current authenticated user profile.
     */
    var currentUser: UserResponse?
        get() = sessionManager.sessionState.value.user
        set(value) {
            sessionManager.updateUser(value)
        }

    /**
     * Clears authentication state (logout) and clears persistent tokens.
     */
    fun logout() {
        sessionManager.clear(_keyValueStorage)
    }

    /**
     * Refreshes the active authentication session using the current [refreshToken].
     * Updates [currentToken] and [refreshToken] on success, or logs out on failure.
     *
     * @return [Result] containing true if refresh succeeded, or [PulseQueryError] on failure.
     */
    suspend fun refreshSession(): Result<Boolean> {
        val ref = refreshToken ?: return Result.failure(
            PulseQueryError.Auth.Unauthenticated("No refresh token present")
        )
        return runCatchingPulseAsync {
            val response = authApi.refreshAccessTokenApiV1AuthRefreshPost(
                RefreshTokenRequest(refreshToken = ref)
            )
            val body = response.asResult().getOrThrow()
            currentToken = body.accessToken
            body.refreshToken?.let { refreshToken = it }
            true
        }.onFailure {
            logout()
        }
    }

    private fun buildDefaultRegistry(baseUrl: String): ApiServiceRegistry {
        return ApiServiceRegistry(
            baseUrl = baseUrl,
            httpClientProvider = {
                createHttpClient(
                    baseUrl = baseUrl,
                    tokenProvider = { currentToken }
                )
            }
        )
    }

    private val _registryFlow = MutableStateFlow(buildDefaultRegistry(getDefaultLocalHost()))

    /** Reactive [StateFlow] of the current immutable [ApiServiceRegistry]. */
    val registryFlow: StateFlow<ApiServiceRegistry> = _registryFlow.asStateFlow()

    /**
     * The base URL to use for API requests. Updating this atomically replaces [registryFlow]
     * with a fresh [ApiServiceRegistry] instance.
     */
    var currentBaseUrl: String
        get() = _registryFlow.value.baseUrl
        set(value) {
            _registryFlow.value = buildDefaultRegistry(value)
        }

    /**
     * Resets all cached HTTP clients, tokens, storage, and API services for test isolation.
     */
    fun resetForTest() {
        sessionManager.clear(null)
        _keyValueStorage = null
        widgetCacheStorage = null
        queryCartRepository.clearCart()
        _registryFlow.value = buildDefaultRegistry(currentBaseUrl)
    }

    /**
     * Overrides the active HTTP client for mock test execution by publishing a new [ApiServiceRegistry].
     *
     * @param client Mocked [HttpClient] instance.
     */
    fun setHttpClientForTest(client: HttpClient) {
        _registryFlow.value = ApiServiceRegistry(baseUrl = currentBaseUrl, httpClient = client)
    }

    /** Active Ktor [HttpClient] from the current [ApiServiceRegistry]. */
    override val httpClient: HttpClient
        get() = _registryFlow.value.httpClient

    /** Client for authentication endpoints. */
    override val authApi: AuthApi
        get() = _registryFlow.value.authApi

    /** Client for dashboard layout and widget persistence endpoints. */
    override val dashboardsApi: DashboardsApi
        get() = _registryFlow.value.dashboardsApi

    /** Client for conversational AI chat and SQL generation endpoints. */
    override val chatApi: ChatApi
        get() = _registryFlow.value.chatApi

    /** Client for analytical report queries. */
    override val analyticsApi: AnalyticsApi
        get() = _registryFlow.value.analyticsApi

    /** Client for MPAX capacity simulation endpoints. */
    override val simulationApi: SimulationApi
        get() = _registryFlow.value.simulationApi

    /** Client for admin configuration endpoints. */
    override val adminApi: AdminApi
        get() = _registryFlow.value.adminApi

    /** Client for admin user management endpoints (listing, roles, active status). */
    override val adminUsersApi: AdminUsersApi
        get() = _registryFlow.value.adminUsersApi

    /** Repository managing live WebSocket collaboration and collaborator presence. */
    override val dashboardWebSocketRepository: DashboardWebSocketRepository
        get() = _registryFlow.value.dashboardWebSocketRepository

    /** Repository managing live Server-Sent Events chat token streaming. */
    override val chatStreamingRepository: ChatStreamingRepository
        get() = _registryFlow.value.chatStreamingRepository

    /** Client for LLM model discovery and arena queries. */
    override val aiApi: AiApi
        get() = _registryFlow.value.aiApi

    /** Client for analytical database catalog schemas. */
    override val schemaApi: SchemaApi
        get() = _registryFlow.value.schemaApi

    /** Client for widget template marketplace endpoints. */
    override val templatesApi: TemplatesApi
        get() = _registryFlow.value.templatesApi

    /** Client for widget analytical query execution endpoints. */
    override val executionApi: ExecutionApi
        get() = _registryFlow.value.executionApi

    /** Client for system diagnostics and health endpoints. */
    override val systemApi: SystemApi
        get() = _registryFlow.value.systemApi

    /** Client for SQL and MPAX benchmark query endpoints. */
    override val benchmarksApi: BenchmarksApi
        get() = _registryFlow.value.benchmarksApi

    /** Client for multi-candidate MPAX Arena competitive evaluation endpoints. */
    override val mpaxArenaApi: MpaxArenaApi
        get() = _registryFlow.value.mpaxArenaApi

    /** Client for hospital capacity alerting thresholds and alert rules endpoints. */
    override val alertRulesApi: AlertRulesApi
        get() = _registryFlow.value.alertRulesApi

    /** Repository monitoring backend health and reachability. */
    override val networkHealthRepository: NetworkHealthRepository
        get() = _registryFlow.value.networkHealthRepository
}
