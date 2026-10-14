/**
 * Dedicated User Registration Screen module for account creation in PulseQuery,
 * delegating state and registration API calls to [AuthViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.ui.screens.auth.AuthUiState
import io.healthplatform.pulsequery.ui.screens.auth.AuthViewModel

/**
 * Re-exported [AuthUiState] typealias preserving package compatibility for registration state consumers.
 */
typealias RegisterScreenState = AuthUiState

/**
 * Screen providing dedicated new user registration with client-side password validation.
 *
 * @param onRegisterSuccess Callback invoked when registration succeeds.
 * @param onNavigateToLogin Callback to switch back to the login screen.
 * @param modifier Optional layout modifier.
 * @param viewModel Optional [AuthViewModel] instance for state orchestration.
 */
@Composable
fun RegisterScreen(
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AuthViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, coroutineScope) {
        viewModel ?: AuthViewModel(scope = coroutineScope)
    }

    val state by vm.state.collectAsState()

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
                    onValueChange = { vm.updateEmail(it) },
                    label = { Text("Email Address") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
                )

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = state.password,
                    onValueChange = { vm.updatePassword(it) },
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = if (state.passwordVisible) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = {
                        IconButton(onClick = { vm.togglePasswordVisibility() }) {
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
                    onValueChange = { vm.updateConfirmPassword(it) },
                    label = { Text("Confirm Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = if (state.passwordVisible) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
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
                    onClick = { vm.register(onRegisterSuccess = onRegisterSuccess) },
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
