package io.healthplatform.pulsequery.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.SQLExecutionRequest
import io.healthplatform.pulsequery.api.models.SQLExecutionResponse
import io.healthplatform.pulsequery.di.AppContainer
import kotlinx.coroutines.launch

/**
 * Editor Screen for writing, previewing, and saving custom SQL queries.
 * Maps to /api/v1/ai/execute
 *
 * @param onNavigateBack Callback to return to the previous screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(onNavigateBack: () -> Unit) {
    var sqlQuery by remember { mutableStateOf("SELECT * FROM patient_admissions LIMIT 10;") }
    var result by remember { mutableStateOf<SQLExecutionResponse?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val coroutineScope = rememberCoroutineScope()

    fun executeSql() {
        if (sqlQuery.isBlank()) return
        
        coroutineScope.launch {
            isLoading = true
            errorMessage = null
            result = null
            try {
                val req = SQLExecutionRequest(sql = sqlQuery, maxRows = 50)
                val response = AppContainer.aiApi.executeSqlPreviewApiV1AiExecutePost(req)
                result = response.body()
            } catch (e: Exception) {
                errorMessage = "Execution failed: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("SQL Editor") },
                navigationIcon = {
                    TextButton(onClick = onNavigateBack) {
                        Text("< Back", color = MaterialTheme.colorScheme.onPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier.fillMaxSize().padding(paddingValues).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Query Editor",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary
            )

            OutlinedTextField(
                value = sqlQuery,
                onValueChange = { sqlQuery = it },
                modifier = Modifier.fillMaxWidth().height(200.dp),
                textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace),
                placeholder = { Text("Enter SQL query here...") }
            )

            Button(
                onClick = { executeSql() },
                modifier = Modifier.align(Alignment.End),
                enabled = !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
                } else {
                    Text("Execute")
                }
            }

            if (errorMessage != null) {
                Text(text = errorMessage!!, color = MaterialTheme.colorScheme.error)
            }

            result?.let { res ->
                HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                
                if (res.error != null) {
                    Text(text = "SQL Error: ${res.error}", color = MaterialTheme.colorScheme.error)
                } else {
                    Text(
                        text = "Results (${res.data.size} rows)",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                    
                    // Simple table/list view for JSON map results
                    LazyColumn(
                        modifier = Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(res.data) { row ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(8.dp)) {
                                    row.entries.forEach { (key, value) ->
                                        Text(
                                            text = "$key: $value",
                                            style = MaterialTheme.typography.bodySmall
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
