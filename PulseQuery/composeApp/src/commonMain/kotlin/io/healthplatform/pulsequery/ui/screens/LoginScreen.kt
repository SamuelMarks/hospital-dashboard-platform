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

/**
 * Authentication Screen.
 * Provides user login and registration utilizing Ktor API models and Compose MD3 layout.
 */
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var showSettingsDialog by remember { mutableStateOf(false) }

    val coroutineScope = rememberCoroutineScope()

    if (showSettingsDialog) {
        var tempUrl by remember { mutableStateOf(AppContainer.currentBaseUrl) }
        AlertDialog(
            onDismissRequest = { showSettingsDialog = false },
            title = { Text("Settings") },
            text = {
                Column {
                    OutlinedTextField(
                        value = tempUrl,
                        onValueChange = { tempUrl = it },
                        label = { Text("Server URL") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Text(
                        text = "Hint: Use http://10.0.2.2:8000 for Android Emulator, or your machine's local IP (e.g., 192.168.x.x) for physical devices.",
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
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showSettingsDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        IconButton(
            onClick = { showSettingsDialog = true },
            modifier = Modifier.align(Alignment.TopEnd).padding(16.dp)
        ) {
            Text("⚙️", style = MaterialTheme.typography.headlineMedium)
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "Welcome to PulseQuery",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(bottom = 32.dp)
            )

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                singleLine = true
            )

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password") },
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
                        errorMessage = "Email and Password cannot be empty."
                        return@Button
                    }

                    isLoading = true
                    errorMessage = null

                    coroutineScope.launch {
                        try {
                            // First attempt to login
                            try {
                                val tokenResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
                                    grantType = "password",
                                    username = email,
                                    password = password,
                                    scope = "",
                                    clientId = null,
                                    clientSecret = null
                                )
                                AppContainer.currentToken = tokenResponse.body().accessToken
                            } catch (loginException: Exception) {
                                // If login fails, try to register
                                try {
                                    val userCreate = UserCreate(email = email, password = password)
                                    AppContainer.authApi.registerUserApiV1AuthRegisterPost(userCreate)
                                    
                                    // Then login again
                                    val tokenResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
                                        grantType = "password",
                                        username = email,
                                        password = password,
                                        scope = "",
                                        clientId = null,
                                        clientSecret = null
                                    )
                                    AppContainer.currentToken = tokenResponse.body().accessToken
                                } catch (registerException: Exception) {
                                    throw Exception("Login failed, and auto-registration also failed: ${registerException.message}")
                                }
                            }

                            // Fetch current user details
                            val meResponse = AppContainer.authApi.readUsersMeApiV1AuthMeGet()
                            if (meResponse.success) {
                                AppContainer.currentUser = meResponse.body()
                                onLoginSuccess()
                            } else {
                                errorMessage = "Failed to fetch user profile."
                            }
                        } catch (e: Exception) {
                            errorMessage = e.message ?: "Authentication failed"
                        } finally {
                            isLoading = false
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(24.dp)
                    )
                } else {
                    Text("Login / Register")
                }
            }
        }
    }
}
