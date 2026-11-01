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
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.already_have_account_sign_in
import pulsequery.composeapp.generated.resources.confirm_password
import pulsequery.composeapp.generated.resources.create_an_account
import pulsequery.composeapp.generated.resources.email_address
import pulsequery.composeapp.generated.resources.hide_password
import pulsequery.composeapp.generated.resources.password
import pulsequery.composeapp.generated.resources.register_account
import pulsequery.composeapp.generated.resources.show_password
import pulsequery.composeapp.generated.resources.sign_up_subtitle

/**
 * Re-exported [AuthUiState] typealias preserving package compatibility for registration state consumers.
 */
typealias RegisterScreenState = AuthUiState

/**
 * Resolves the [VisualTransformation] for password fields based on visibility state.
 *
 * @param passwordVisible True when plaintext password should be shown.
 * @return [VisualTransformation.None] when visible, or [PasswordVisualTransformation] when masked.
 */
internal fun resolvePasswordVisualTransformation(passwordVisible: Boolean): VisualTransformation {
    return if (passwordVisible) {
        VisualTransformation.None
    } else {
        PasswordVisualTransformation()
    }
}

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
            RegisterCardContent(
                state = state,
                vm = vm,
                onRegisterSuccess = onRegisterSuccess,
                onNavigateToLogin = onNavigateToLogin
            )
        }
    }
}

/**
 * Renders the interior form fields and action buttons inside [RegisterScreen].
 *
 * @param state Current [AuthUiState] snapshot.
 * @param vm Active [AuthViewModel] handling input mutations and submission.
 * @param onRegisterSuccess Callback invoked when registration succeeds.
 * @param onNavigateToLogin Callback to navigate back to login screen.
 */
@Composable
private fun RegisterCardContent(
    state: AuthUiState,
    vm: AuthViewModel,
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit
) {
    val visualTransformation = resolvePasswordVisualTransformation(state.passwordVisible)

    Column(
        modifier = Modifier
            .padding(24.dp)
            .fillMaxWidth()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(Res.string.create_an_account),
            style = MaterialTheme.typography.headlineMedium
        )
        Text(
            text = stringResource(Res.string.sign_up_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Spacer(modifier = Modifier.height(20.dp))

        OutlinedTextField(
            value = state.email,
            onValueChange = { vm.updateEmail(it) },
            label = { Text(stringResource(Res.string.email_address)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email)
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = state.password,
            onValueChange = { vm.updatePassword(it) },
            label = { Text(stringResource(Res.string.password)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = visualTransformation,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                PasswordVisibilityToggleButton(
                    passwordVisible = state.passwordVisible,
                    onToggle = { vm.togglePasswordVisibility() }
                )
            }
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedTextField(
            value = state.confirmPassword,
            onValueChange = { vm.updateConfirmPassword(it) },
            label = { Text(stringResource(Res.string.confirm_password)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            visualTransformation = visualTransformation,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password)
        )

        state.errorMessage?.let { errorMsg ->
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = errorMsg,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        }

        state.successMessage?.let { successMsg ->
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = successMsg,
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
            RegisterSubmitButtonContent(isLoading = state.isLoading)
        }

        Spacer(modifier = Modifier.height(12.dp))

        TextButton(
            onClick = onNavigateToLogin,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(Res.string.already_have_account_sign_in))
        }
    }
}

/**
 * Renders the interior label or progress indicator for the submit button in [RegisterScreen].
 *
 * @param isLoading Whether registration is currently in progress.
 */
@Composable
private fun RegisterSubmitButtonContent(isLoading: Boolean) {
    if (isLoading) {
        CircularProgressIndicator(
            color = MaterialTheme.colorScheme.onPrimary,
            modifier = Modifier.size(24.dp)
        )
    } else {
        Text(stringResource(Res.string.register_account))
    }
}

/**
 * Renders the trailing icon button that toggles password visibility.
 *
 * @param passwordVisible Current password visibility flag.
 * @param onToggle Callback invoked when the toggle icon is clicked.
 */
@Composable
private fun PasswordVisibilityToggleButton(
    passwordVisible: Boolean,
    onToggle: () -> Unit
) {
    IconButton(onClick = onToggle) {
        Icon(
            if (passwordVisible) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
            contentDescription = if (passwordVisible) {
                stringResource(Res.string.hide_password)
            } else {
                stringResource(Res.string.show_password)
            }
        )
    }
}
