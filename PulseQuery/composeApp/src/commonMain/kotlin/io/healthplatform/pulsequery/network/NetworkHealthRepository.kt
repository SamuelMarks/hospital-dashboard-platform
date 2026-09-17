package io.healthplatform.pulsequery.network

import io.healthplatform.pulsequery.api.apis.SystemApi
import io.healthplatform.pulsequery.api.models.SystemHealthResponse
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Repository responsible for monitoring Pulse Query backend connectivity and database health.
 *
 * @param systemApi The system API client used to perform health checks.
 * @param scope CoroutineScope for executing asynchronous health checks.
 */
class NetworkHealthRepository(
    private val systemApi: SystemApi = AppContainer.systemApi,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Main)
) {
    private val _isOnline = MutableStateFlow(true)
    /** StateFlow indicating whether the backend server is reachable. */
    val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    private val _isDatabaseHealthy = MutableStateFlow(true)
    /** StateFlow indicating whether relational (PostgreSQL) and OLAP (DuckDB) databases are healthy. */
    val isDatabaseHealthy: StateFlow<Boolean> = _isDatabaseHealthy.asStateFlow()

    private val _healthState = MutableStateFlow<SystemHealthResponse?>(null)
    /** StateFlow exposing the latest retrieved system health response. */
    val healthState: StateFlow<SystemHealthResponse?> = _healthState.asStateFlow()

    private val _isChecking = MutableStateFlow(false)
    /** StateFlow indicating whether a health ping is currently in flight. */
    val isChecking: StateFlow<Boolean> = _isChecking.asStateFlow()

    private val _lastError = MutableStateFlow<String?>(null)
    /** StateFlow holding the most recent error message, if any. */
    val lastError: StateFlow<String?> = _lastError.asStateFlow()

    /**
     * Checks backend reachability and updates health status flows.
     *
     * @return [Result] containing [SystemHealthResponse] on success or [PulseQueryError] on failure.
     */
    suspend fun checkHealth(): Result<SystemHealthResponse> {
        _isChecking.value = true
        return runCatching {
            val response = systemApi.getSystemHealthApiV1SystemHealthGet(strict = false)
            response.body()
        }.onSuccess { health ->
            _healthState.value = health
            _isOnline.value = true
            _lastError.value = null

            val pgOk = health.postgres.status.equals("connected", ignoreCase = true) ||
                health.postgres.status.equals("ready", ignoreCase = true)
            val duckOk = health.duckdb.status.equals("ready", ignoreCase = true) ||
                health.duckdb.status.equals("connected", ignoreCase = true)
            val overallNotCrit = !health.overallStatus.equals("critical", ignoreCase = true)
            _isDatabaseHealthy.value = pgOk && duckOk && overallNotCrit
        }.onFailure { e ->
            _isOnline.value = false
            _isDatabaseHealthy.value = false
            _lastError.value = e.message ?: "Backend unreachable"
        }.also {
            _isChecking.value = false
        }
    }

    /**
     * Triggers an asynchronous health check on the repository's coroutine scope.
     */
    fun refreshHealth() {
        scope.launch {
            checkHealth()
        }
    }
}
