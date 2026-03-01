package io.healthplatform.pulsequery.di

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
     * Shared Ktor HttpClient, initialized lazily.
     */
    val httpClient by lazy {
        createHttpClient(baseUrl = "api.pulsequery.com", tokenProvider = { currentToken })
    }

    /**
     * Auth API instance, generated via OpenAPI.
     */
    val authApi by lazy {
        AuthApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Dashboards API instance for fetching workspace dashboards.
     */
    val dashboardsApi by lazy {
        DashboardsApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Chat API instance for conversational queries.
     */
    val chatApi by lazy {
        ChatApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Analytics API instance for telemetry and platform usage data.
     */
    val analyticsApi by lazy {
        AnalyticsApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Simulation API instance for executing scenario modeling and predictions.
     */
    val simulationApi by lazy {
        SimulationApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Admin API instance for managing platform configurations.
     */
    val adminApi by lazy {
        AdminApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * AI API instance for generating and previewing queries.
     */
    val aiApi by lazy {
        AiApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Schema API instance for exploring the active database structures.
     */
    val schemaApi by lazy {
        SchemaApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Templates API instance for managing saved widget configurations.
     */
    val templatesApi by lazy {
        TemplatesApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }

    /**
     * Execution API instance for refreshing dashboards and widgets.
     */
    val executionApi by lazy {
        ExecutionApi(baseUrl = "https://api.pulsequery.com", httpClient = httpClient)
    }
}
