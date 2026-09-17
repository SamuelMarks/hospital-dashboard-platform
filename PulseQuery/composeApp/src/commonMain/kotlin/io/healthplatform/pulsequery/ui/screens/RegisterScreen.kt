/**
 * Dedicated User Registration Screen module for account creation in PulseQuery.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * State container for the dedicated Registration Screen.
 *
 * @property email Entered email address.
 * @property password Entered password.
 * @property confirmPassword Repeated confirmation password.
 * @property isLoading Whether registration network call is in flight.
 * @property errorMessage Validation or API error message.
 * @property successMessage Confirmation message upon successful account registration.
 * @property passwordVisible Toggle for revealing password text.
 */
data class RegisterScreenState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val successMessage: String? = null,
    val passwordVisible: Boolean = false
)

/**
 * Screen providing dedicated new user registration with client-side password validation.
 *
 * @param onRegisterSuccess Callback invoked when registration succeeds.
 * @param onNavigateToLogin Callback to switch back to the login screen.
 * @param modifier Optional layout modifier.
 */
@Composable
fun RegisterScreen(
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit,
    modifier: Modifier = Modifier
) {
    var state by remember { mutableStateOf(RegisterScreenState()) }
    val coroutineScope = rememberCoroutineScope()

    /**
     * Validates input fields and executes user registration via AuthApi.
     */
    fun handleRegister() {
        val email = state.email.trim()
        val password = state.password
        val confirm = state.confirmPassword

        if (email.isBlank() || password.isBlank() || confirm.isBlank()) {
            state = state.copy(errorMessage = "All fields are required.")
            return
        }

        if (password != confirm) {
            state = state.copy(errorMessage = "Passwords do not match.")
            return
        }

        if (password.length < 6) {
            state = state.copy(errorMessage = "Password must be at least 6 characters.")
            return
        }

        coroutineScope.launch {
            state = state.copy(isLoading = true, errorMessage = null)
            runCatching {
                val req = UserCreate(email = email, password = password)
                val res = AppContainer.authApi.registerUserApiV1AuthRegisterPost(req)
                if (!res.success) {
                    val displayMsg = if (res.status == 400) {
                        "An account with this email already exists."
                    } else {
                        "Registration failed (Error ${res.status})."
                    }
                    state = state.copy(isLoading = false, errorMessage = displayMsg)
                    return@runCatching
                }
                state = state.copy(
                    isLoading = false,
                    successMessage = "Account created successfully! Please sign in."
                )
                onRegisterSuccess()
            }.onFailure { e ->
                val msg = e.message ?: "Registration failed"
                val displayMsg = if (msg.contains("400") || msg.contains("already registered", ignoreCase = true)) {
                    "An account with this email already exists."
                } else {
                    msg
                }
                state = state.copy(isLoading = false, errorMessage = displayMsg)
            }
        }
    }

    Box(
        modifier = modifier.fillMaxSize().padding(16.dp),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier.fillMaxWidth().widthIn(max = 450.dp),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Create an Account",
                    style = MaterialTheme.typography.headlineMedium
                )
                Text(
                    text = "Sign up for Pulse Query Clinical Analytics",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(20.dp))

                OutlinedTextField(
                    value = state.email,
                    onValueChange = { state = state.copy(email = it, errorMessage = null) },
                    label = { Text("Email Address") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = state.password,
                    onValueChange = { state = state.copy(password = it, errorMessage = null) },
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = if (state.passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton(onClick = { state = state.copy(passwordVisible = !state.passwordVisible) }) {
                            Icon(
                                if (state.passwordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                contentDescription = if (state.passwordVisible) "Hide password" else "Show password"
                            )
                        }
                    }
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = state.confirmPassword,
                    onValueChange = { state = state.copy(confirmPassword = it, errorMessage = null) },
                    label = { Text("Confirm Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = if (state.passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
                )

                if (state.errorMessage != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = state.errorMessage ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                if (state.successMessage != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = state.successMessage ?: "",
                        color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                Button(
                    onClick = { handleRegister() },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp),
                    enabled = !state.isLoading
                ) {
                    if (state.isLoading) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.size(24.dp)
                        )
                    } else {
                        Text("Register Account")
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                TextButton(
                    onClick = onNavigateToLogin,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Already have an account? Sign In")
                }
            }
        }
    }
}
