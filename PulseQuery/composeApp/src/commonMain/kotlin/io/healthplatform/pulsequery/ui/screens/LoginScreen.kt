/**
 * Component for rendering the LoginScreen.
 * Provides the main user interface for this screen.
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.UserCreate
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Authentication Screen.
 * Provides user login and registration utilizing Ktor API models and Compose MD3 layout.
 *
 * @param onLoginSuccess Callback invoked upon successful user authentication.
 * @param onNavigateToRegister Optional callback to navigate to dedicated registration screen.
 */
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: (() -> Unit)? = null
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var showSettingsDialog by remember { mutableStateOf(false) }
    var isRegisterMode by remember { mutableStateOf(false) }

    val coroutineScope = rememberCoroutineScope()
    
    val errEmptyFields = stringResource(Res.string.email_and_password_cannot_be_empty)
    val errFetchProfile = stringResource(Res.string.failed_to_fetch_user_profile)
    val errAuthFailed = stringResource(Res.string.authentication_failed)
    val errLoginRegFailed = stringResource(Res.string.login_failed, "")

    if (showSettingsDialog) {
        var tempUrl by remember { mutableStateOf(AppContainer.currentBaseUrl) }
        AlertDialog(
            onDismissRequest = { showSettingsDialog = false },
            title = { Text(stringResource(Res.string.settings)) },
            text = {
                Column {
                    OutlinedTextField(
                        value = tempUrl,
                        onValueChange = { tempUrl = it },
                        label = { Text(stringResource(Res.string.server_url)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = stringResource(Res.string.server_url_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    AppContainer.currentBaseUrl = tempUrl
                    showSettingsDialog = false
                }) {
                    Text(stringResource(Res.string.save))
                }
            },
            dismissButton = {
                TextButton(onClick = { showSettingsDialog = false }) {
                    Text(stringResource(Res.string.cancel))
                }
            }
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        IconButton(
            onClick = { showSettingsDialog = true },
            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp)
        ) {
            Text(stringResource(Res.string.settings_icon), style = MaterialTheme.typography.headlineMedium)
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = stringResource(Res.string.welcome_to_pulsequery),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 32.dp)
            )

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text(stringResource(Res.string.email)) },
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                singleLine = true
            )

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text(stringResource(Res.string.password)) },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                singleLine = true
            )

            errorMessage?.let { msg ->
                Text(
                    text = msg,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
            }

            Button(
                onClick = {
                    if (email.isBlank() || password.isBlank()) {
                        errorMessage = errEmptyFields
                        return@Button
                    }

                    isLoading = true
                    errorMessage = null

                    coroutineScope.launch {
                        runCatching {
                            if (isRegisterMode) {
                                val userCreate = UserCreate(email = email, password = password)
                                AppContainer.authApi.registerUserApiV1AuthRegisterPost(userCreate)
                            }

                            val tokenResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
                                grantType = "password",
                                username = email,
                                password = password,
                                scope = "",
                                clientId = null,
                                clientSecret = null
                            )
                            AppContainer.currentToken = tokenResponse.body().accessToken

                            // Fetch current user details
                            val meResponse = AppContainer.authApi.readUsersMeApiV1AuthMeGet()
                            if (meResponse.success) {
                                AppContainer.currentUser = meResponse.body()
                                onLoginSuccess()
                            } else {
                                errorMessage = errFetchProfile
                            }
                        }.onFailure { e ->
                            println("LoginScreen ERROR: ${e.message}")
                            val msg = e.message ?: ""
                            errorMessage = when {
                                isRegisterMode -> "Registration failed: ${if (msg.contains("already registered", ignoreCase = true)) "Email already registered" else msg.ifBlank { errAuthFailed }}"
                                msg.contains("401", ignoreCase = true) || msg.contains("Unauthorized", ignoreCase = true) -> "Invalid username or password."
                                msg.contains("timeout", ignoreCase = true) -> "Network timeout. Please check your connection."
                                else -> errAuthFailed
                            }
                        }
                        isLoading = false
                    }
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(24.dp)
                    )
                } else {
                    Text(if (isRegisterMode) "Register" else stringResource(Res.string.login_register))
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            TextButton(
                onClick = {
                    if (onNavigateToRegister != null) {
                        onNavigateToRegister()
                    } else {
                        isRegisterMode = !isRegisterMode
                        errorMessage = null
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isRegisterMode) "Already have an account? Log In" else "Need an account? Register")
            }
        }
    }
}
