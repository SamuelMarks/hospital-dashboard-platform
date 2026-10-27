/**
 * Component for rendering the LoginScreen.
 * Provides the main user interface for authentication, delegating state and
 * backend operations to [AuthViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.di.AppContainer
import io.healthplatform.pulsequery.ui.screens.auth.AuthViewModel
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.already_have_account_log_in
import pulsequery.composeapp.generated.resources.authentication_failed
import pulsequery.composeapp.generated.resources.cancel
import pulsequery.composeapp.generated.resources.email
import pulsequery.composeapp.generated.resources.email_and_password_cannot_be_empty
import pulsequery.composeapp.generated.resources.failed_to_fetch_user_profile
import pulsequery.composeapp.generated.resources.login_register
import pulsequery.composeapp.generated.resources.need_an_account_register
import pulsequery.composeapp.generated.resources.password
import pulsequery.composeapp.generated.resources.register_button
import pulsequery.composeapp.generated.resources.save
import pulsequery.composeapp.generated.resources.server_url
import pulsequery.composeapp.generated.resources.server_url_hint
import pulsequery.composeapp.generated.resources.settings
import pulsequery.composeapp.generated.resources.settings_icon
import pulsequery.composeapp.generated.resources.welcome_to_pulsequery

/**
 * Authentication Screen.
 * Provides user login and registration utilizing Ktor API models and Compose MD3 layout.
 *
 * @param onLoginSuccess Callback invoked upon successful user authentication.
 * @param onNavigateToRegister Optional callback to navigate to dedicated registration screen.
 * @param viewModel Optional [AuthViewModel] instance for state orchestration.
 */
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: (() -> Unit)? = null,
    viewModel: AuthViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, coroutineScope) {
        viewModel ?: AuthViewModel(scope = coroutineScope)
    }

    val uiState by vm.state.collectAsState()

    val errEmptyFields = stringResource(Res.string.email_and_password_cannot_be_empty)
    val errFetchProfile = stringResource(Res.string.failed_to_fetch_user_profile)
    val errAuthFailed = stringResource(Res.string.authentication_failed)

    if (uiState.showSettingsDialog) {
        var tempUrl by remember { mutableStateOf(AppContainer.currentBaseUrl) }
        AlertDialog(
            onDismissRequest = { vm.setShowSettingsDialog(false) },
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
                TextButton(onClick = { vm.saveBaseUrl(tempUrl) }) {
                    Text(stringResource(Res.string.save))
                }
            },
            dismissButton = {
                TextButton(onClick = { vm.setShowSettingsDialog(false) }) {
                    Text(stringResource(Res.string.cancel))
                }
            }
        )
    }

    Box(modifier = Modifier.fillMaxSize()) {
        IconButton(
            onClick = { vm.setShowSettingsDialog(true) },
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
                value = uiState.email,
                onValueChange = { vm.updateEmail(it) },
                label = { Text(stringResource(Res.string.email)) },
                modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                singleLine = true
            )

            OutlinedTextField(
                value = uiState.password,
                onValueChange = { vm.updatePassword(it) },
                label = { Text(stringResource(Res.string.password)) },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
                singleLine = true
            )

            uiState.errorMessage?.let { msg ->
                Text(
                    text = msg,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
            }

            Button(
                onClick = {
                    vm.login(
                        errEmptyFields = errEmptyFields,
                        errFetchProfile = errFetchProfile,
                        errAuthFailed = errAuthFailed,
                        onLoginSuccess = onLoginSuccess
                    )
                },
                modifier = Modifier.fillMaxWidth().heightIn(min = 50.dp),
                enabled = !uiState.isLoading
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(24.dp)
                    )
                } else {
                    Text(
                        if (uiState.isRegisterMode) {
                            stringResource(Res.string.register_button)
                        } else {
                            stringResource(Res.string.login_register)
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            TextButton(
                onClick = {
                    if (onNavigateToRegister != null) {
                        onNavigateToRegister()
                    } else {
                        vm.toggleRegisterMode()
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    if (uiState.isRegisterMode) {
                        stringResource(Res.string.already_have_account_log_in)
                    } else {
                        stringResource(Res.string.need_an_account_register)
                    }
                )
            }
        }
    }
}
