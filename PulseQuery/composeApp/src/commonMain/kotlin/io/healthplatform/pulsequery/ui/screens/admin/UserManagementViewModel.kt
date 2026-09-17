package io.healthplatform.pulsequery.ui.screens.admin

import io.healthplatform.pulsequery.api.apis.AdminUsersApi
import io.healthplatform.pulsequery.api.models.UserResponse
import io.healthplatform.pulsequery.api.models.UserRoleUpdate
import io.healthplatform.pulsequery.api.models.UserStatusUpdate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * UI State representation for the Administrator User Management interface.
 */
sealed interface UserManagementUiState {
    /** State indicating users are currently being loaded from the backend API. */
    data object Loading : UserManagementUiState

    /**
     * State representing a successfully loaded and filtered list of user profiles.
     *
     * @property users Filtered list of registered user profiles.
     * @property allUsers Unfiltered master list of users fetched from the API.
     * @property searchQuery Active textual search query applied to user emails.
     * @property selectedRole Active clinical role filter tag, or null for all roles.
     */
    data class Success(
        val users: List<UserResponse>,
        val allUsers: List<UserResponse>,
        val searchQuery: String = "",
        val selectedRole: String? = null
    ) : UserManagementUiState

    /**
     * State representing an error encountered during data operations.
     *
     * @property message Human-readable error description.
     */
    data class Error(val message: String) : UserManagementUiState
}

/**
 * ViewModel managing administrative user management workflows, including listing users,
 * modifying clinical role assignments, and toggling active status.
 *
 * @property scope Coroutine scope used for launching asynchronous network requests.
 * @property adminUsersApi API client for invoking administrative user endpoints.
 */
class UserManagementViewModel(
    private val scope: CoroutineScope,
    private val adminUsersApi: AdminUsersApi = AppContainer.adminUsersApi
) {
    private val _state = MutableStateFlow<UserManagementUiState>(UserManagementUiState.Loading)

    /** Exposes read-only StateFlow of user management state for UI observation. */
    val state: StateFlow<UserManagementUiState> = _state.asStateFlow()

    init {
        loadUsers()
    }

    /**
     * Fetches registered hospital users from the backend administrative API.
     */
    fun loadUsers() {
        _state.value = UserManagementUiState.Loading
        scope.launch {
            runCatching {
                val response = adminUsersApi.listUsersApiV1AdminUsersGet(limit = 100)
                response.body()
            }.fold(
                onSuccess = { users ->
                    _state.value = UserManagementUiState.Success(
                        users = users,
                        allUsers = users,
                        searchQuery = "",
                        selectedRole = null
                    )
                },
                onFailure = { e ->
                    _state.value = UserManagementUiState.Error(e.message ?: "Failed to load users")
                }
            )
        }
    }

    /**
     * Updates the clinical or administrative role of a specific user.
     *
     * @param userId Unique identifier of target user.
     * @param newRole Desired clinical role (e.g., ADMIN, PHYSICIAN, CHARGE_NURSE, ANALYST).
     */
    fun updateRole(userId: String, newRole: String) {
        val current = _state.value as? UserManagementUiState.Success ?: return
        scope.launch {
            runCatching {
                val response = adminUsersApi.updateUserRoleApiV1AdminUsersUserIdRolePut(
                    userId = userId,
                    userRoleUpdate = UserRoleUpdate(role = newRole)
                )
                response.body()
            }.fold(
                onSuccess = { updated ->
                    val newAllUsers = current.allUsers.map { if (it.id == userId) updated else it }
                    _state.value = current.copy(
                        allUsers = newAllUsers,
                        users = filterUsers(newAllUsers, current.searchQuery, current.selectedRole)
                    )
                },
                onFailure = { e ->
                    _state.value = UserManagementUiState.Error(e.message ?: "Failed to update role")
                }
            )
        }
    }

    /**
     * Toggles the active account status (active/suspended) of a user.
     *
     * @param userId Unique identifier of target user.
     * @param newStatus Desired active flag status.
     */
    fun toggleStatus(userId: String, newStatus: Boolean) {
        val current = _state.value as? UserManagementUiState.Success ?: return
        scope.launch {
            runCatching {
                val response = adminUsersApi.updateUserStatusApiV1AdminUsersUserIdStatusPut(
                    userId = userId,
                    userStatusUpdate = UserStatusUpdate(isActive = newStatus)
                )
                response.body()
            }.fold(
                onSuccess = { updated ->
                    val newAllUsers = current.allUsers.map { if (it.id == userId) updated else it }
                    _state.value = current.copy(
                        allUsers = newAllUsers,
                        users = filterUsers(newAllUsers, current.searchQuery, current.selectedRole)
                    )
                },
                onFailure = { e ->
                    _state.value = UserManagementUiState.Error(e.message ?: "Failed to toggle user status")
                }
            )
        }
    }

    /**
     * Applies textual filtering on user email addresses.
     *
     * @param query Search query string.
     */
    fun setSearchQuery(query: String) {
        val current = _state.value as? UserManagementUiState.Success ?: return
        _state.value = current.copy(
            searchQuery = query,
            users = filterUsers(current.allUsers, query, current.selectedRole)
        )
    }

    /**
     * Filters displayed user profiles by clinical role.
     *
     * @param role Target clinical role, or null to clear role filter.
     */
    fun setRoleFilter(role: String?) {
        val current = _state.value as? UserManagementUiState.Success ?: return
        _state.value = current.copy(
            selectedRole = role,
            users = filterUsers(current.allUsers, current.searchQuery, role)
        )
    }

    private fun filterUsers(
        users: List<UserResponse>,
        query: String,
        role: String?
    ): List<UserResponse> {
        return users.filter { user ->
            val matchesQuery = query.isBlank() || user.email.contains(query, ignoreCase = true)
            val matchesRole = role == null || user.role.equals(role, ignoreCase = true)
            matchesQuery && matchesRole
        }
    }
}
