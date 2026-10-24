/**
 * Authentication ViewModel module orchestrating user login, account registration,
 * password validation, and server URL configuration.
 */
package io.healthplatform.pulsequery.ui.screens.auth

import io.healthplatform.pulsequery.api.apis.AuthApi
import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.core.error.PulseQueryError
import io.healthplatform.pulsequery.core.result.messageOrDefault
import io.healthplatform.pulsequery.core.result.runCatchingPulseAsync
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Immutable UI state for [io.healthplatform.pulsequery.ui.screens.LoginScreen]
 * and [io.healthplatform.pulsequery.ui.screens.RegisterScreen].
 *
 * @property email Entered user email address.
 * @property password Entered user password.
 * @property confirmPassword Repeated confirmation password used during registration.
 * @property isLoading Whether an authentication or registration request is currently in flight.
 * @property errorMessage Validation or backend error message, if any.
 * @property successMessage Confirmation message upon successful account registration.
 * @property passwordVisible Whether password characters are currently visible in plain text.
 * @property isRegisterMode Whether the login form is toggled into inline registration mode.
 * @property showSettingsDialog Whether the server URL configuration dialog is currently open.
 */
data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
    val passwordVisible: Boolean = false,
    val isRegisterMode: Boolean = false,
    val showSettingsDialog: Boolean = false
)

/**
 * ViewModel managing state and backend calls for authentication and registration screens.
 *
 * @property scope Coroutine scope used for asynchronous API requests.
 * @property authApi Optional explicit [AuthApi] client for authentication endpoints.
 */
class AuthViewModel(
    private val scope: CoroutineScope,
    private val authApi: AuthApi? = null
) {
    private val currentAuthApi: AuthApi
        get() = authApi ?: AppContainer.authApi

    private val _state = MutableStateFlow(AuthUiState())

    /** Reactive [StateFlow] of the current [AuthUiState]. */
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    /**
     * Updates the email input field and clears any active error message.
     *
     * @param email New email string.
     */
    fun updateEmail(email: String) {
        _state.update { it.copy(email = email, errorMessage = null) }
    }

    /**
     * Updates the password input field and clears any active error message.
     *
     * @param password New password string.
     */
    fun updatePassword(password: String) {
        _state.update { it.copy(password = password, errorMessage = null) }
    }

    /**
     * Updates the confirmation password input field and clears any active error message.
     *
     * @param confirmPassword New confirmation password string.
     */
    fun updateConfirmPassword(confirmPassword: String) {
        _state.update { it.copy(confirmPassword = confirmPassword, errorMessage = null) }
    }

    /**
     * Toggles plain-text visibility for password fields.
     */
    fun togglePasswordVisibility() {
        _state.update { it.copy(passwordVisible = !it.passwordVisible) }
    }

    /**
     * Toggles between login and inline registration modes on the login screen.
     */
    fun toggleRegisterMode() {
        _state.update { it.copy(isRegisterMode = !it.isRegisterMode, errorMessage = null) }
    }

    /**
     * Shows or hides the server URL settings dialog.
     *
     * @param show True to display the dialog, false to dismiss it.
     */
    fun setShowSettingsDialog(show: Boolean) {
        _state.update { it.copy(showSettingsDialog = show) }
    }

    /**
     * Updates the backend server base URL in [AppContainer] and closes the settings dialog.
     *
     * @param newUrl Updated server base URL string.
     */
    fun saveBaseUrl(newUrl: String) {
        AppContainer.currentBaseUrl = newUrl
        _state.update { it.copy(showSettingsDialog = false) }
    }

    /**
     * Authenticates the user (and optionally registers them first when in inline register mode),
     * stores the access token, and fetches the authenticated user's profile.
     *
     * @param errEmptyFields Localized error message when email or password is blank.
     * @param errFetchProfile Localized error message when fetching user profile fails.
     * @param errAuthFailed Localized fallback error message when authentication fails.
     * @param onLoginSuccess Callback invoked upon successful login and profile retrieval.
     */
    fun login(
        errEmptyFields: String,
        errFetchProfile: String,
        errAuthFailed: String,
        onLoginSuccess: () -> Unit
    ) {
        val current = _state.value
        if (current.email.isBlank() || current.password.isBlank()) {
            _state.update { it.copy(errorMessage = errEmptyFields) }
            return
        }

        _state.update { it.copy(isLoading = true, errorMessage = null) }

        scope.launch {
            runCatchingPulseAsync {
                executeLoginFlow(current, errFetchProfile, onLoginSuccess)
            }.onFailure { e ->
                val formattedError = formatLoginError(e, current.isRegisterMode, errAuthFailed)
                _state.update { it.copy(isLoading = false, errorMessage = formattedError) }
            }
        }
    }

    /**
     * Executes the network calls for login (and optional inline registration) and profile lookup.
     *
     * @param current Snapshot of the active [AuthUiState].
     * @param errFetchProfile Fallback error message when `/me` profile retrieval fails.
     * @param onLoginSuccess Callback invoked upon successful login and profile retrieval.
     */
    private suspend fun executeLoginFlow(
        current: AuthUiState,
        errFetchProfile: String,
        onLoginSuccess: () -> Unit
    ) {
        if (current.isRegisterMode) {
            val userCreate = UserCreate(email = current.email, password = current.password)
            currentAuthApi.registerUserApiV1AuthRegisterPost(userCreate)
        }

        val tokenResponse = currentAuthApi.loginAccessTokenApiV1AuthLoginPost(
            grantType = "password",
            username = current.email,
            password = current.password,
            scope = "",
            clientId = null,
            clientSecret = null
        )
        AppContainer.currentToken = tokenResponse.body().accessToken

        val meResponse = currentAuthApi.readUsersMeApiV1AuthMeGet()
        if (meResponse.success) {
            AppContainer.currentUser = meResponse.body()
            _state.update { it.copy(isLoading = false, errorMessage = null) }
            onLoginSuccess()
        } else {
            _state.update { it.copy(isLoading = false, errorMessage = errFetchProfile) }
        }
    }

    /**
     * Maps a thrown authentication or registration error to a user-friendly message.
     *
     * @param error Caught [Throwable] or [PulseQueryError].
     * @param isRegisterMode Whether the failure occurred during inline registration.
     * @param errAuthFailed Fallback authentication failure message.
     * @return User-friendly error message string.
     */
    private fun formatLoginError(
        error: Throwable,
        isRegisterMode: Boolean,
        errAuthFailed: String
    ): String {
        val msg = PulseQueryError.fromThrowable(error).messageOrDefault("")
        if (isRegisterMode) {
            val detail = if (msg.contains("already registered", ignoreCase = true)) {
                "Email already registered"
            } else {
                msg.ifBlank { errAuthFailed }
            }
            return "Registration failed: $detail"
        }
        return when {
            msg.contains("401", ignoreCase = true) || msg.contains("Unauthorized", ignoreCase = true) ->
                "Invalid username or password."
            msg.contains("timeout", ignoreCase = true) ->
                "Network timeout. Please check your connection."
            else -> errAuthFailed
        }
    }

    /**
     * Validates registration inputs and creates a new user account via [AuthApi].
     *
     * @param onRegisterSuccess Callback invoked when registration succeeds.
     */
    fun register(onRegisterSuccess: () -> Unit) {
        val current = _state.value
        val validationError = validateRegistrationInput(current)
        if (validationError != null) {
            _state.update { it.copy(errorMessage = validationError) }
            return
        }

        val email = current.email.trim()
        val password = current.password

        scope.launch {
            _state.update { it.copy(isLoading = true, errorMessage = null) }
            runCatchingPulseAsync {
                executeRegistrationFlow(email, password, onRegisterSuccess)
            }.onFailure { e ->
                val displayMsg = formatRegistrationError(e)
                _state.update { it.copy(isLoading = false, errorMessage = displayMsg) }
            }
        }
    }

    /**
     * Validates registration fields and returns an error string or null when valid.
     *
     * @param current Current [AuthUiState] to validate.
     * @return Validation error description, or null if valid.
     */
    private fun validateRegistrationInput(current: AuthUiState): String? {
        val email = current.email.trim()
        val password = current.password
        val confirm = current.confirmPassword
        return when {
            email.isBlank() || password.isBlank() || confirm.isBlank() -> "All fields are required."
            password != confirm -> "Passwords do not match."
            password.length < 6 -> "Password must be at least 6 characters."
            else -> null
        }
    }

    /**
     * Executes the user registration API request and updates [state] accordingly.
     *
     * @param email Trimmed user email address.
     * @param password User password string.
     * @param onRegisterSuccess Callback invoked when registration succeeds.
     */
    private suspend fun executeRegistrationFlow(
        email: String,
        password: String,
        onRegisterSuccess: () -> Unit
    ) {
        val req = UserCreate(email = email, password = password)
        val res = currentAuthApi.registerUserApiV1AuthRegisterPost(req)
        if (!res.success) {
            val displayMsg = if (res.status == 400) {
                "An account with this email already exists."
            } else {
                "Registration failed (Error ${res.status})."
            }
            _state.update { it.copy(isLoading = false, errorMessage = displayMsg) }
            return
        }
        _state.update {
            it.copy(
                isLoading = false,
                successMessage = "Account created successfully! Please sign in."
            )
        }
        onRegisterSuccess()
    }

    /**
     * Formats a thrown registration error into a user-facing error message.
     *
     * @param error Caught [Throwable] or [PulseQueryError].
     * @return Formatted registration error string.
     */
    private fun formatRegistrationError(error: Throwable): String {
        val pulseError = PulseQueryError.fromThrowable(error)
        val msg = pulseError.messageOrDefault("Registration failed")
        return if (isDuplicateRegistrationError(pulseError, msg)) {
            "An account with this email already exists."
        } else {
            msg
        }
    }

    /**
     * Checks whether [pulseError] or its [msg] indicates an existing registered account.
     *
     * @param pulseError Normalized [PulseQueryError] instance.
     * @param msg Fallback message string.
     * @return True if the failure represents a duplicate registration conflict.
     */
    private fun isDuplicateRegistrationError(pulseError: PulseQueryError, msg: String): Boolean {
        return pulseError is PulseQueryError.Http.BadRequest ||
            msg.contains("400") ||
            msg.contains("already registered", ignoreCase = true)
    }
}
