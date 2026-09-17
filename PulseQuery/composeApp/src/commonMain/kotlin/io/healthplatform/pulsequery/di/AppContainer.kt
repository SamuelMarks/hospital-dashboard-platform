package io.healthplatform.pulsequery.di

import io.healthplatform.pulsequery.api.models.UserResponse
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
import io.healthplatform.pulsequery.network.createHttpClient
import io.healthplatform.pulsequery.network.DashboardWebSocketRepository
import io.healthplatform.pulsequery.network.ChatStreamingRepository
import io.healthplatform.pulsequery.network.NetworkHealthRepository
import io.healthplatform.pulsequery.getDefaultLocalHost
import io.healthplatform.pulsequery.database.KeyValueStorage
import io.healthplatform.pulsequery.database.WidgetCacheStorage
import io.healthplatform.pulsequery.core.error.PulseQueryError

/**
 * Lightweight, manual Dependency Injection container for PulseQuery.
 * Ensures singletons for network clients and API endpoints.
 */
object AppContainer {

    const val KEY_AUTH_TOKEN: String = "pulse_auth_token"
    const val KEY_REFRESH_TOKEN: String = "pulse_refresh_token"

    private var _keyValueStorage: KeyValueStorage? = null

    /** Simple key-value storage backed by SQLDelight database. */
    var keyValueStorage: KeyValueStorage?
        get() = _keyValueStorage
        set(value) {
            _keyValueStorage = value
            if (value != null && _currentToken == null) {
                _currentToken = value.get(KEY_AUTH_TOKEN)
                _refreshToken = value.get(KEY_REFRESH_TOKEN)
            }
        }

    /** Cache storage for offline widget query snapshots. */
    var widgetCacheStorage: WidgetCacheStorage? = null

    /**
     * Initializes the database, key-value storage, and widget cache storage
     * using the supplied platform-specific driver factory.
     *
     * @param driverFactory Factory providing the platform SQLite driver.
     */
    fun initDatabase(driverFactory: io.healthplatform.pulsequery.database.DatabaseDriverFactory) {
        val database = io.healthplatform.pulsequery.database.createDatabase(driverFactory)
        keyValueStorage = KeyValueStorage(database)
        widgetCacheStorage = WidgetCacheStorage(database)
    }

    /** Repository for staging ad-hoc clinical queries in mobile query cart. */
    val queryCartRepository: io.healthplatform.pulsequery.network.QueryCartRepository = io.healthplatform.pulsequery.network.QueryCartRepository()

    private var _currentToken: String? = null

    /**
     * Stores the current auth token across the session, persisting to KeyValueStorage if present.
     */
    var currentToken: String?
        get() = _currentToken
        set(value) {
            _currentToken = value
            if (value != null) {
                _keyValueStorage?.save(KEY_AUTH_TOKEN, value)
            } else {
                _keyValueStorage?.remove(KEY_AUTH_TOKEN)
            }
        }

    private var _refreshToken: String? = null

    /**
     * Stores the current refresh token across the session, persisting to KeyValueStorage if present.
     */
    var refreshToken: String?
        get() = _refreshToken
        set(value) {
            _refreshToken = value
            if (value != null) {
                _keyValueStorage?.save(KEY_REFRESH_TOKEN, value)
            } else {
                _keyValueStorage?.remove(KEY_REFRESH_TOKEN)
            }
        }

    /**
     * Stores the current authenticated user profile.
     */
    var currentUser: UserResponse? = null

    /**
     * Clears authentication state (logout) and clears persistent tokens.
     */
    fun logout() {
        currentToken = null
        refreshToken = null
        currentUser = null
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
        return runCatching {
            val response = authApi.refreshAccessTokenApiV1AuthRefreshPost(
                io.healthplatform.pulsequery.api.models.RefreshTokenRequest(refreshToken = ref)
            )
            val body = response.body()
            currentToken = body.accessToken
            body.refreshToken?.let { refreshToken = it }
            true
        }.onFailure {
            logout()
        }
    }

    /**
     * The base URL to use for API requests.
     */
    var currentBaseUrl: String = getDefaultLocalHost()
        set(value) {
            field = value
            _httpClient = null
            _authApi = null
            _dashboardsApi = null
            _chatApi = null
            _analyticsApi = null
            _simulationApi = null
            _adminApi = null
            _adminUsersApi = null
            _dashboardWebSocketRepository = null
            _chatStreamingRepository = null
            _aiApi = null
            _schemaApi = null
            _templatesApi = null
            _executionApi = null
            _systemApi = null
            _benchmarksApi = null
            _mpaxArenaApi = null
            _alertRulesApi = null
            _networkHealthRepository = null
        }

    /**
     * Resets all cached HTTP clients and API services for test isolation.
     */
    fun resetForTest() {
        _currentToken = null
        _refreshToken = null
        currentUser = null
        _keyValueStorage = null
        widgetCacheStorage = null
        _httpClient = null
        _authApi = null
        _dashboardsApi = null
        _chatApi = null
        _analyticsApi = null
        _simulationApi = null
        _adminApi = null
        _adminUsersApi = null
        _dashboardWebSocketRepository = null
        _chatStreamingRepository = null
        _aiApi = null
        _schemaApi = null
        _templatesApi = null
        _executionApi = null
        _systemApi = null
        _benchmarksApi = null
        _mpaxArenaApi = null
        _alertRulesApi = null
        _networkHealthRepository = null
    }

    /**
     * Overrides the active HTTP client for mock test execution.
     *
     * @param client Mocked [io.ktor.client.HttpClient] instance.
     */
    fun setHttpClientForTest(client: io.ktor.client.HttpClient) { 
        _httpClient = client
        _authApi = null
        _dashboardsApi = null
        _chatApi = null
        _analyticsApi = null
        _simulationApi = null
        _adminApi = null
        _adminUsersApi = null
        _dashboardWebSocketRepository = null
        _chatStreamingRepository = null
        _aiApi = null
        _schemaApi = null
        _templatesApi = null
        _executionApi = null
        _systemApi = null
        _benchmarksApi = null
        _mpaxArenaApi = null
        _alertRulesApi = null
        _networkHealthRepository = null
    }

    private var _httpClient: io.ktor.client.HttpClient? = null

    /** Lazily instantiated HTTP client configured for current base URL and auth token. */
    val httpClient: io.ktor.client.HttpClient
        get() {
            if (_httpClient == null) {
                _httpClient = createHttpClient(
                    baseUrl = currentBaseUrl,
                    tokenProvider = { currentToken },
                    refreshTokenProvider = { refreshToken },
                    onTokenRefreshed = { newAccess, newRefresh ->
                        currentToken = newAccess
                        if (newRefresh != null) {
                            refreshToken = newRefresh
                        }
                    }
                )
            }
            return _httpClient!!
        }

    private var _authApi: AuthApi? = null

    /** Client for authentication endpoints. */
    val authApi: AuthApi
        get() {
            if (_authApi == null) {
                _authApi = AuthApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _authApi!!
        }

    private var _dashboardsApi: DashboardsApi? = null

    /** Client for dashboard layout and widget persistence endpoints. */
    val dashboardsApi: DashboardsApi
        get() {
            if (_dashboardsApi == null) {
                _dashboardsApi = DashboardsApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _dashboardsApi!!
        }

    private var _chatApi: ChatApi? = null

    /** Client for conversational AI chat and SQL generation endpoints. */
    val chatApi: ChatApi
        get() {
            if (_chatApi == null) {
                _chatApi = ChatApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _chatApi!!
        }

    private var _analyticsApi: AnalyticsApi? = null

    /** Client for analytical report queries. */
    val analyticsApi: AnalyticsApi
        get() {
            if (_analyticsApi == null) {
                _analyticsApi = AnalyticsApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _analyticsApi!!
        }

    private var _simulationApi: SimulationApi? = null

    /** Client for MPAX capacity simulation endpoints. */
    val simulationApi: SimulationApi
        get() {
            if (_simulationApi == null) {
                _simulationApi = SimulationApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _simulationApi!!
        }

    private var _adminApi: AdminApi? = null

    /** Client for admin configuration endpoints. */
    val adminApi: AdminApi
        get() {
            if (_adminApi == null) {
                _adminApi = AdminApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _adminApi!!
        }

    private var _adminUsersApi: AdminUsersApi? = null

    /** Client for admin user management endpoints (listing, roles, active status). */
    val adminUsersApi: AdminUsersApi
        get() {
            if (_adminUsersApi == null) {
                _adminUsersApi = AdminUsersApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _adminUsersApi!!
        }

    private var _dashboardWebSocketRepository: DashboardWebSocketRepository? = null

    /** Repository managing live WebSocket collaboration and collaborator presence. */
    val dashboardWebSocketRepository: DashboardWebSocketRepository
        get() {
            if (_dashboardWebSocketRepository == null) {
                _dashboardWebSocketRepository = DashboardWebSocketRepository()
            }
            return _dashboardWebSocketRepository!!
        }

    private var _chatStreamingRepository: ChatStreamingRepository? = null

    /** Repository managing live Server-Sent Events chat token streaming. */
    val chatStreamingRepository: ChatStreamingRepository
        get() {
            if (_chatStreamingRepository == null) {
                _chatStreamingRepository = ChatStreamingRepository()
            }
            return _chatStreamingRepository!!
        }

    private var _aiApi: AiApi? = null

    /** Client for LLM model discovery and arena queries. */
    val aiApi: AiApi
        get() {
            if (_aiApi == null) {
                _aiApi = AiApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _aiApi!!
        }

    private var _schemaApi: SchemaApi? = null

    /** Client for analytical database catalog schemas. */
    val schemaApi: SchemaApi
        get() {
            if (_schemaApi == null) {
                _schemaApi = SchemaApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _schemaApi!!
        }

    private var _templatesApi: TemplatesApi? = null

    /** Client for widget template marketplace endpoints. */
    val templatesApi: TemplatesApi
        get() {
            if (_templatesApi == null) {
                _templatesApi = TemplatesApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _templatesApi!!
        }

    private var _executionApi: ExecutionApi? = null

    /** Client for widget analytical query execution endpoints. */
    val executionApi: ExecutionApi
        get() {
            if (_executionApi == null) {
                _executionApi = ExecutionApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _executionApi!!
        }

    private var _systemApi: SystemApi? = null

    /** Client for system diagnostics and health endpoints. */
    val systemApi: SystemApi
        get() {
            if (_systemApi == null) {
                _systemApi = SystemApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _systemApi!!
        }

    private var _benchmarksApi: BenchmarksApi? = null

    /** Client for SQL and MPAX benchmark query endpoints. */
    val benchmarksApi: BenchmarksApi
        get() {
            if (_benchmarksApi == null) {
                _benchmarksApi = BenchmarksApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _benchmarksApi!!
        }

    private var _mpaxArenaApi: MpaxArenaApi? = null

    /** Client for multi-candidate MPAX Arena competitive evaluation endpoints. */
    val mpaxArenaApi: MpaxArenaApi
        get() {
            if (_mpaxArenaApi == null) {
                _mpaxArenaApi = MpaxArenaApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _mpaxArenaApi!!
        }

    private var _alertRulesApi: AlertRulesApi? = null

    /** Client for hospital capacity alerting thresholds and alert rules endpoints. */
    val alertRulesApi: AlertRulesApi
        get() {
            if (_alertRulesApi == null) {
                _alertRulesApi = AlertRulesApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _alertRulesApi!!
        }

    private var _networkHealthRepository: NetworkHealthRepository? = null

    /** Repository monitoring backend health and reachability. */
    val networkHealthRepository: NetworkHealthRepository
        get() {
            if (_networkHealthRepository == null) {
                _networkHealthRepository = NetworkHealthRepository(systemApi = systemApi)
            }
            return _networkHealthRepository!!
        }
}
