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
import io.healthplatform.pulsequery.database.DatabaseDriverFactory
import io.healthplatform.pulsequery.database.KeyValueStorage
import io.healthplatform.pulsequery.database.WidgetCacheStorage
import io.healthplatform.pulsequery.database.createDatabase
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
) {
    /** Active Ktor [HttpClient] instance resolved lazily on first network access. */
    val httpClient: HttpClient by lazy { httpClientProvider() }

    /** Secondary constructor accepting an already-created [HttpClient] instance. */
    constructor(baseUrl: String, httpClient: HttpClient) : this(
        baseUrl = baseUrl,
        httpClientProvider = { httpClient }
    )
    /** Client for authentication endpoints. */
    val authApi: AuthApi by lazy { AuthApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for dashboard layout and widget persistence endpoints. */
    val dashboardsApi: DashboardsApi by lazy { DashboardsApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for conversational AI chat and SQL generation endpoints. */
    val chatApi: ChatApi by lazy { ChatApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for analytical report queries. */
    val analyticsApi: AnalyticsApi by lazy { AnalyticsApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for MPAX capacity simulation endpoints. */
    val simulationApi: SimulationApi by lazy { SimulationApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for admin configuration endpoints. */
    val adminApi: AdminApi by lazy { AdminApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for admin user management endpoints (listing, roles, active status). */
    val adminUsersApi: AdminUsersApi by lazy { AdminUsersApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for LLM model discovery and arena queries. */
    val aiApi: AiApi by lazy { AiApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for analytical database catalog schemas. */
    val schemaApi: SchemaApi by lazy { SchemaApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for widget template marketplace endpoints. */
    val templatesApi: TemplatesApi by lazy { TemplatesApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for widget analytical query execution endpoints. */
    val executionApi: ExecutionApi by lazy { ExecutionApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for system diagnostics and health endpoints. */
    val systemApi: SystemApi by lazy { SystemApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for SQL and MPAX benchmark query endpoints. */
    val benchmarksApi: BenchmarksApi by lazy { BenchmarksApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for multi-candidate MPAX Arena competitive evaluation endpoints. */
    val mpaxArenaApi: MpaxArenaApi by lazy { MpaxArenaApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Client for hospital capacity alerting thresholds and alert rules endpoints. */
    val alertRulesApi: AlertRulesApi by lazy { AlertRulesApi(baseUrl = baseUrl, httpClient = httpClient) }

    /** Repository managing live WebSocket collaboration and collaborator presence. */
    val dashboardWebSocketRepository: DashboardWebSocketRepository by lazy {
        DashboardWebSocketRepository(httpClient = httpClient, baseUrlProvider = { baseUrl })
    }

    /** Repository managing live Server-Sent Events chat token streaming. */
    val chatStreamingRepository: ChatStreamingRepository by lazy {
        ChatStreamingRepository(httpClient = httpClient, baseUrlProvider = { baseUrl })
    }

    /** Repository monitoring backend health and reachability. */
    val networkHealthRepository: NetworkHealthRepository by lazy {
        NetworkHealthRepository(systemApi = systemApi)
    }
}

/**
 * Lightweight Dependency Injection container for PulseQuery.
 * Holds an immutable [ApiServiceRegistry] in a [StateFlow] and manages session persistence.
 */
object AppContainer {

    /** Storage key for the active JWT access token. */
    const val KEY_AUTH_TOKEN: String = "pulse_auth_token"

    /** Storage key for the active JWT refresh token. */
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
    fun initDatabase(driverFactory: DatabaseDriverFactory) {
        val database = createDatabase(driverFactory)
        keyValueStorage = KeyValueStorage(database)
        widgetCacheStorage = WidgetCacheStorage(database)
    }

    /** Repository for staging ad-hoc clinical queries in mobile query cart. */
    val queryCartRepository: QueryCartRepository = QueryCartRepository()

    private var _currentToken: String? = null

    /**
     * Stores the current auth token across the session, persisting to [KeyValueStorage] if present.
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
     * Stores the current refresh token across the session, persisting to [KeyValueStorage] if present.
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
                RefreshTokenRequest(refreshToken = ref)
            )
            val body = response.body()
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
        _currentToken = null
        _refreshToken = null
        currentUser = null
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
    val httpClient: HttpClient
        get() = _registryFlow.value.httpClient

    /** Client for authentication endpoints. */
    val authApi: AuthApi
        get() = _registryFlow.value.authApi

    /** Client for dashboard layout and widget persistence endpoints. */
    val dashboardsApi: DashboardsApi
        get() = _registryFlow.value.dashboardsApi

    /** Client for conversational AI chat and SQL generation endpoints. */
    val chatApi: ChatApi
        get() = _registryFlow.value.chatApi

    /** Client for analytical report queries. */
    val analyticsApi: AnalyticsApi
        get() = _registryFlow.value.analyticsApi

    /** Client for MPAX capacity simulation endpoints. */
    val simulationApi: SimulationApi
        get() = _registryFlow.value.simulationApi

    /** Client for admin configuration endpoints. */
    val adminApi: AdminApi
        get() = _registryFlow.value.adminApi

    /** Client for admin user management endpoints (listing, roles, active status). */
    val adminUsersApi: AdminUsersApi
        get() = _registryFlow.value.adminUsersApi

    /** Repository managing live WebSocket collaboration and collaborator presence. */
    val dashboardWebSocketRepository: DashboardWebSocketRepository
        get() = _registryFlow.value.dashboardWebSocketRepository

    /** Repository managing live Server-Sent Events chat token streaming. */
    val chatStreamingRepository: ChatStreamingRepository
        get() = _registryFlow.value.chatStreamingRepository

    /** Client for LLM model discovery and arena queries. */
    val aiApi: AiApi
        get() = _registryFlow.value.aiApi

    /** Client for analytical database catalog schemas. */
    val schemaApi: SchemaApi
        get() = _registryFlow.value.schemaApi

    /** Client for widget template marketplace endpoints. */
    val templatesApi: TemplatesApi
        get() = _registryFlow.value.templatesApi

    /** Client for widget analytical query execution endpoints. */
    val executionApi: ExecutionApi
        get() = _registryFlow.value.executionApi

    /** Client for system diagnostics and health endpoints. */
    val systemApi: SystemApi
        get() = _registryFlow.value.systemApi

    /** Client for SQL and MPAX benchmark query endpoints. */
    val benchmarksApi: BenchmarksApi
        get() = _registryFlow.value.benchmarksApi

    /** Client for multi-candidate MPAX Arena competitive evaluation endpoints. */
    val mpaxArenaApi: MpaxArenaApi
        get() = _registryFlow.value.mpaxArenaApi

    /** Client for hospital capacity alerting thresholds and alert rules endpoints. */
    val alertRulesApi: AlertRulesApi
        get() = _registryFlow.value.alertRulesApi

    /** Repository monitoring backend health and reachability. */
    val networkHealthRepository: NetworkHealthRepository
        get() = _registryFlow.value.networkHealthRepository
}
