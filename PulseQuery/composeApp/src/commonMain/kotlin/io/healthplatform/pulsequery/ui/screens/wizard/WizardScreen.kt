/**
 * Wizard UI module providing guided template selection and multi-modal custom widget instantiation.
 */
package io.healthplatform.pulsequery.ui.screens.wizard

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.TemplateResponse
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.*

/**
 * Screen providing a guided wizard to browse template marketplace, configure parameters,
 * and instantiate new analytical widgets on a dashboard.
 *
 * @param dashboardId The identifier of the dashboard being configured.
 * @param onComplete Callback invoked when the widget has been created.
 * @param onBack Callback invoked when navigating backwards or dismissing the wizard.
 * @param viewModel Optional pre-configured ViewModel, default constructs standard instance.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WizardScreen(
    dashboardId: String = "",
    onComplete: () -> Unit = {},
    onBack: () -> Unit = {},
    viewModel: WizardViewModel? = null
) {
    val coroutineScope = rememberCoroutineScope()
    val vm = viewModel ?: remember(dashboardId) { WizardViewModel(dashboardId = dashboardId, scope = coroutineScope) }
    val state by vm.state.collectAsState()

    val screenTitle = when (state) {
        is WizardState.ParameterConfiguration -> stringResource(Res.string.configure_widget)
        is WizardState.CustomWidgetConfiguration -> "Custom Widget Builder"
        else -> stringResource(Res.string.template_marketplace)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(screenTitle) },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            if (state is WizardState.ParameterConfiguration || state is WizardState.CustomWidgetConfiguration) {
                                vm.backToTemplates()
                            } else {
                                onBack()
                            }
                        }
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(Res.string.back))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    titleContentColor = MaterialTheme.colorScheme.onSurface
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentAlignment = Alignment.Center
        ) {
            when (val s = state) {
                is WizardState.Loading -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        CircularProgressIndicator()
                        Text(stringResource(Res.string.loading_templates))
                    }
                }

                is WizardState.TemplateSelection -> {
                    TemplateSelectionContent(
                        state = s,
                        onCategorySelected = { vm.selectCategory(it) },
                        onSearchChanged = { vm.updateSearchQuery(it) },
                        onTemplateSelected = { vm.selectTemplate(it) },
                        onStartCustom = { vm.startCustomWidget(it) }
                    )
                }

                is WizardState.ParameterConfiguration -> {
                    ParameterConfigurationContent(
                        state = s,
                        onTitleChanged = { vm.updateWidgetTitle(it) },
                        onVisualizationChanged = { vm.updateVisualization(it) },
                        onParameterChanged = { k, v -> vm.updateParameterValue(k, v) },
                        onSubmit = { vm.submitWidget { onComplete() } },
                        onBack = { vm.backToTemplates() }
                    )
                }

                is WizardState.CustomWidgetConfiguration -> {
                    CustomWidgetConfigurationContent(
                        state = s,
                        onTitleChanged = { vm.updateCustomWidgetTitle(it) },
                        onContentChanged = { vm.updateCustomWidgetContent(it) },
                        onVisualizationChanged = { vm.updateCustomWidgetViz(it) },
                        onHttpMethodChanged = { vm.updateCustomWidgetHttpMethod(it) },
                        onSubmit = { vm.submitCustomWidget { onComplete() } },
                        onBack = { vm.backToTemplates() }
                    )
                }

                is WizardState.Submitting -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        CircularProgressIndicator()
                        Text(stringResource(Res.string.creating_widget))
                    }
                }

                is WizardState.Success -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.padding(24.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(64.dp)
                        )
                        Text(
                            text = stringResource(Res.string.widget_created_success),
                            style = MaterialTheme.typography.titleLarge
                        )
                        Button(onClick = onComplete) {
                            Text(stringResource(Res.string.ok))
                        }
                    }
                }

                is WizardState.Error -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.padding(24.dp)
                    ) {
                        Text(
                            text = s.message,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center
                        )
                        Button(onClick = { vm.loadTemplates() }) {
                            Text(stringResource(Res.string.retry))
                        }
                    }
                }
            }
        }
    }
}

/**
 * Renders the marketplace template list with category chips, custom widget creation shortcuts, and search filter.
 *
 * @param state Active template selection state.
 * @param onCategorySelected Callback when category filter chip is toggled.
 * @param onSearchChanged Callback when search text changes.
 * @param onTemplateSelected Callback when a specific template is selected.
 * @param onStartCustom Callback when initiating custom widget authoring.
 */
@Composable
fun TemplateSelectionContent(
    state: WizardState.TemplateSelection,
    onCategorySelected: (String?) -> Unit,
    onSearchChanged: (String) -> Unit,
    onTemplateSelected: (TemplateResponse) -> Unit,
    onStartCustom: (String) -> Unit = {}
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text(
                text = "Creation Source",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = true,
                    onClick = {},
                    label = { Text("Templates") }
                )
                FilterChip(
                    selected = false,
                    onClick = { onStartCustom("SQL") },
                    label = { Text("+ Custom SQL") }
                )
                FilterChip(
                    selected = false,
                    onClick = { onStartCustom("HTTP") },
                    label = { Text("+ Custom HTTP") }
                )
                FilterChip(
                    selected = false,
                    onClick = { onStartCustom("TEXT") },
                    label = { Text("+ Note / Text") }
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = onSearchChanged,
                placeholder = { Text(stringResource(Res.string.search_templates)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Search templates input" }
            )
        }

        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = state.selectedCategory == null,
                    onClick = { onCategorySelected(null) },
                    label = { Text(stringResource(Res.string.all_categories)) }
                )
                state.categories.forEach { category ->
                    FilterChip(
                        selected = state.selectedCategory.equals(category, ignoreCase = true),
                        onClick = { onCategorySelected(category) },
                        label = { Text(category) }
                    )
                }
            }
        }

        if (state.filteredTemplates.isEmpty()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(32.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(Res.string.no_templates_found),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            items(state.filteredTemplates) { template ->
                TemplateCard(
                    template = template,
                    onClick = { onTemplateSelected(template) }
                )
            }
        }
    }
}

/**
 * Renders an individual template card in the marketplace.
 *
 * @param template The template item to render.
 * @param onClick Callback when the card is clicked.
 */
@Composable
fun TemplateCard(
    template: TemplateResponse,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Template: ${template.title}" },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = template.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                SuggestionChip(
                    onClick = {},
                    label = { Text(template.category) }
                )
            }
            if (!template.description.isNullOrBlank()) {
                Text(
                    text = template.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/**
 * Renders the parameter configuration form for a chosen template.
 *
 * @param state Active parameter configuration state.
 * @param onTitleChanged Callback when widget title is updated.
 * @param onVisualizationChanged Callback when visualization format is toggled.
 * @param onParameterChanged Callback when parameter input value is modified.
 * @param onSubmit Callback when submitting the widget creation.
 * @param onBack Callback when returning to the template marketplace.
 */
@Composable
fun ParameterConfigurationContent(
    state: WizardState.ParameterConfiguration,
    onTitleChanged: (String) -> Unit,
    onVisualizationChanged: (String) -> Unit,
    onParameterChanged: (String, String) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit
) {
    val visualizations = listOf("table", "bar_chart", "line_chart", "metric")

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            OutlinedTextField(
                value = state.widgetTitle,
                onValueChange = onTitleChanged,
                label = { Text(stringResource(Res.string.widget_title)) },
                isError = state.fieldErrors.containsKey("title"),
                supportingText = state.fieldErrors["title"]?.let { { Text(it) } },
                modifier = Modifier.fillMaxWidth()
            )
        }

        item {
            Text(
                text = stringResource(Res.string.visualization_type),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                visualizations.forEach { vis ->
                    FilterChip(
                        selected = state.visualization.equals(vis, ignoreCase = true),
                        onClick = { onVisualizationChanged(vis) },
                        label = { Text(vis.replace('_', ' ').replaceFirstChar { it.uppercase() }) }
                    )
                }
            }
        }

        if (state.parameterFields.isNotEmpty()) {
            item {
                Text(
                    text = stringResource(Res.string.parameters),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.semantics { heading() }
                )
            }

            items(state.parameterFields) { field ->
                val error = state.fieldErrors[field.key]
                OutlinedTextField(
                    value = state.parameterValues[field.key] ?: "",
                    onValueChange = { onParameterChanged(field.key, it) },
                    label = { Text(if (field.isRequired) "${field.title} *" else field.title) },
                    isError = error != null,
                    supportingText = {
                        if (error != null) {
                            Text(error)
                        } else if (field.defaultValue.isNotBlank()) {
                            Text("Default: ${field.defaultValue}")
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                OutlinedButton(
                    onClick = onBack,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(stringResource(Res.string.back))
                }

                Button(
                    onClick = onSubmit,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(stringResource(Res.string.create_widget_button))
                }
            }
        }
    }
}

/**
 * Renders the authoring form for custom widgets (Custom SQL, HTTP endpoint, or Markdown Note).
 *
 * @param state Active custom configuration state.
 * @param onTitleChanged Callback when title is modified.
 * @param onContentChanged Callback when query, URL, or text is modified.
 * @param onVisualizationChanged Callback when visualization format is modified.
 * @param onHttpMethodChanged Callback when HTTP verb is modified.
 * @param onSubmit Callback when submitting the widget creation.
 * @param onBack Callback when returning to the marketplace.
 */
@Composable
fun CustomWidgetConfigurationContent(
    state: WizardState.CustomWidgetConfiguration,
    onTitleChanged: (String) -> Unit,
    onContentChanged: (String) -> Unit,
    onVisualizationChanged: (String) -> Unit,
    onHttpMethodChanged: (String) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit
) {
    val visualizations = listOf("table", "bar_chart", "line_chart", "metric", "markdown")
    val httpMethods = listOf("GET", "POST", "PUT")

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "Authoring: ${state.creationType} Widget",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        }

        item {
            OutlinedTextField(
                value = state.widgetTitle,
                onValueChange = onTitleChanged,
                label = { Text("Widget Title") },
                isError = state.fieldErrors.containsKey("title"),
                supportingText = state.fieldErrors["title"]?.let { { Text(it) } },
                modifier = Modifier.fillMaxWidth()
            )
        }

        if (state.creationType == "HTTP") {
            item {
                Text(
                    text = "HTTP Verb",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    httpMethods.forEach { method ->
                        FilterChip(
                            selected = state.httpMethod.equals(method, ignoreCase = true),
                            onClick = { onHttpMethodChanged(method) },
                            label = { Text(method) }
                        )
                    }
                }
            }
        }

        item {
            val contentLabel = when (state.creationType) {
                "HTTP" -> "Endpoint URL (e.g. https://api.hospital.org/v1/metrics)"
                "TEXT" -> "Markdown Content / Notes"
                else -> "SQL Query"
            }
            OutlinedTextField(
                value = state.queryOrUrlOrContent,
                onValueChange = onContentChanged,
                label = { Text(contentLabel) },
                minLines = 4,
                maxLines = 10,
                isError = state.fieldErrors.containsKey("content"),
                supportingText = state.fieldErrors["content"]?.let { { Text(it) } },
                modifier = Modifier.fillMaxWidth()
            )
        }

        item {
            Text(
                text = "Visualization Format",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                visualizations.forEach { vis ->
                    FilterChip(
                        selected = state.visualization.equals(vis, ignoreCase = true),
                        onClick = { onVisualizationChanged(vis) },
                        label = { Text(vis.replace('_', ' ').replaceFirstChar { it.uppercase() }) }
                    )
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                OutlinedButton(
                    onClick = onBack,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(stringResource(Res.string.back))
                }

                Button(
                    onClick = onSubmit,
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Create Widget")
                }
            }
        }
    }
}
