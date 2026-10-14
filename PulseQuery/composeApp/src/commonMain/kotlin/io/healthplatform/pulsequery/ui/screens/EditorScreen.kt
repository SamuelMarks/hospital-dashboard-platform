/**
 * Component for rendering the EditorScreen.
 * Provides the main user interface for writing, previewing, and saving custom SQL queries,
 * delegating all state and API calls to [EditorViewModel].
 */
package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.ui.screens.editor.EditorViewModel
import io.healthplatform.pulsequery.ui.screens.editor.SaveQueryDialog
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.enter_sql_query_here
import pulsequery.composeapp.generated.resources.execute
import pulsequery.composeapp.generated.resources.execution_failed_msg
import pulsequery.composeapp.generated.resources.query
import pulsequery.composeapp.generated.resources.results_rows
import pulsequery.composeapp.generated.resources.sql_editor
import pulsequery.composeapp.generated.resources.sql_error_msg

/**
 * Editor Screen for writing, previewing, and saving custom SQL queries.
 *
 * @param viewModel Optional [EditorViewModel] instance for state orchestration.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(
    viewModel: EditorViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = remember(viewModel, coroutineScope) {
        viewModel ?: EditorViewModel(scope = coroutineScope)
    }

    val uiState by vm.state.collectAsState()
    var showSaveDialog by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    val errExecFailed = stringResource(Res.string.execution_failed_msg, "")

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(Res.string.sql_editor)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                ),
                actions = {
                    IconButton(
                        onClick = { showSaveDialog = true },
                        enabled = uiState.sqlQuery.isNotBlank()
                    ) {
                        Icon(Icons.Filled.Save, contentDescription = "Save Query")
                    }
                    TextButton(
                        onClick = { vm.stageToCart() }
                    ) {
                        Text("Add to Cart")
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { vm.executeSql(errorPrefix = errExecFailed) },
                icon = {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    } else {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                    }
                },
                text = { Text(stringResource(Res.string.execute)) },
                expanded = !uiState.isLoading
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier.fillMaxSize().padding(paddingValues).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = uiState.sqlQuery,
                onValueChange = { vm.updateSqlQuery(it) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 250.dp),
                textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace),
                placeholder = { Text(stringResource(Res.string.enter_sql_query_here)) },
                label = { Text(stringResource(Res.string.query)) },
                shape = MaterialTheme.shapes.medium
            )

            uiState.errorMessage?.let { err ->
                ElevatedCard(
                    colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = err,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }

            uiState.result?.let { res ->
                HorizontalDivider()

                val sqlErr = res.error
                if (sqlErr != null) {
                    ElevatedCard(
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = stringResource(Res.string.sql_error_msg, sqlErr),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.padding(16.dp)
                        )
                    }
                } else {
                    Text(
                        text = pluralStringResource(Res.plurals.results_rows, res.data.size, res.data.size),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary
                    )

                    LazyColumn(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        items(res.data) { row ->
                            ElevatedCard(
                                modifier = Modifier.fillMaxWidth(),
                                elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp)
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    row.entries.forEach { (key, value) ->
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(
                                                text = key,
                                                style = MaterialTheme.typography.labelMedium,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            Text(
                                                text = value.toString(),
                                                style = MaterialTheme.typography.bodyMedium,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                        }
                                        Spacer(modifier = Modifier.height(4.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showSaveDialog) {
        SaveQueryDialog(
            sql = uiState.sqlQuery,
            onDismiss = { showSaveDialog = false },
            onSaved = { msg ->
                showSaveDialog = false
                coroutineScope.launch {
                    snackbarHostState.showSnackbar(msg)
                }
            }
        )
    }
}
