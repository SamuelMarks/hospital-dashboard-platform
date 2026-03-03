package io.healthplatform.pulsequery.di

import io.healthplatform.pulsequery.api.models.UserResponse
import io.healthplatform.pulsequery.api.apis.AdminApi
import io.healthplatform.pulsequery.api.apis.AiApi
import io.healthplatform.pulsequery.api.apis.AnalyticsApi
import io.healthplatform.pulsequery.api.apis.AuthApi
import io.healthplatform.pulsequery.api.apis.ChatApi
import io.healthplatform.pulsequery.api.apis.DashboardsApi
import io.healthplatform.pulsequery.api.apis.ExecutionApi
import io.healthplatform.pulsequery.api.apis.SchemaApi
import io.healthplatform.pulsequery.api.apis.SimulationApi
import io.healthplatform.pulsequery.api.apis.TemplatesApi
import io.healthplatform.pulsequery.network.createHttpClient
import io.healthplatform.pulsequery.getDefaultLocalHost

/**
 * Lightweight, manual Dependency Injection container for PulseQuery.
 * Ensures singletons for network clients and API endpoints.
 */
object AppContainer {
    
    /**
     * Stores the current auth token across the session.
     * In a full implementation, this should interface with platform-native secure storage.
     */
    var currentToken: String? = null

    /**
     * Stores the current authenticated user profile.
     */
    var currentUser: UserResponse? = null

    /**
     * Clears authentication state (logout).
     */
    fun logout() {
        currentToken = null
        currentUser = null
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
            _aiApi = null
            _schemaApi = null
            _templatesApi = null
            _executionApi = null
        }

    fun setHttpClientForTest(client: io.ktor.client.HttpClient) { 
        _httpClient = client 
    }
    private var _httpClient: io.ktor.client.HttpClient? = null
    val httpClient: io.ktor.client.HttpClient
        get() {
            if (_httpClient == null) {
                _httpClient = createHttpClient(baseUrl = currentBaseUrl, tokenProvider = { currentToken })
            }
            return _httpClient!!
        }

    private var _authApi: AuthApi? = null
    val authApi: AuthApi
        get() {
            if (_authApi == null) {
                _authApi = AuthApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _authApi!!
        }

    private var _dashboardsApi: DashboardsApi? = null
    val dashboardsApi: DashboardsApi
        get() {
            if (_dashboardsApi == null) {
                _dashboardsApi = DashboardsApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _dashboardsApi!!
        }

    private var _chatApi: ChatApi? = null
    val chatApi: ChatApi
        get() {
            if (_chatApi == null) {
                _chatApi = ChatApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _chatApi!!
        }

    private var _analyticsApi: AnalyticsApi? = null
    val analyticsApi: AnalyticsApi
        get() {
            if (_analyticsApi == null) {
                _analyticsApi = AnalyticsApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _analyticsApi!!
        }

    private var _simulationApi: SimulationApi? = null
    val simulationApi: SimulationApi
        get() {
            if (_simulationApi == null) {
                _simulationApi = SimulationApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _simulationApi!!
        }

    private var _adminApi: AdminApi? = null
    val adminApi: AdminApi
        get() {
            if (_adminApi == null) {
                _adminApi = AdminApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _adminApi!!
        }

    private var _aiApi: AiApi? = null
    val aiApi: AiApi
        get() {
            if (_aiApi == null) {
                _aiApi = AiApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _aiApi!!
        }

    private var _schemaApi: SchemaApi? = null
    val schemaApi: SchemaApi
        get() {
            if (_schemaApi == null) {
                _schemaApi = SchemaApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _schemaApi!!
        }

    private var _templatesApi: TemplatesApi? = null
    val templatesApi: TemplatesApi
        get() {
            if (_templatesApi == null) {
                _templatesApi = TemplatesApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _templatesApi!!
        }

    private var _executionApi: ExecutionApi? = null
    val executionApi: ExecutionApi
        get() {
            if (_executionApi == null) {
                _executionApi = ExecutionApi(baseUrl = currentBaseUrl, httpClient = httpClient)
            }
            return _executionApi!!
        }
}
