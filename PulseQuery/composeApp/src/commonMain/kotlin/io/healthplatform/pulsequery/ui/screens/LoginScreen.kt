package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Authentication Screen.
 * Provides user login utilizing Ktor API models and Compose MD3 layout.
 */
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }

    val coroutineScope = rememberCoroutineScope()

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
                        // Using the AppContainer's lazy authApi
                        // The backend expects an OAuth2PasswordRequestForm.
                        // For the purpose of the manual test, we encode as URL-Encoded forms.
                        val tokenResponse = AppContainer.authApi.loginAccessTokenApiV1AuthLoginPost(
                            grantType = "password",
                            username = email,
                            password = password,
                            scope = "",
                            clientId = null,
                            clientSecret = null
                        )

                        // Store globally for next requests
                        AppContainer.currentToken = tokenResponse.body().accessToken

                        // Navigate explicitly via parent callback
                        onLoginSuccess()
                    } catch (e: Exception) {
                        errorMessage = "Login failed: ${e.message}"
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
                Text("Login")
            }
        }
    }
}
