/**
 * Wizard UI module providing guided template selection and multi-modal custom widget instantiation.
 */
package io.healthplatform.pulsequery.ui.screens.wizard

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.healthplatform.pulsequery.api.models.TemplateResponse
import io.healthplatform.pulsequery.core.model.ProcessorId
import io.healthplatform.pulsequery.core.model.ProcessorSelectionOption
import io.healthplatform.pulsequery.ui.components.TemplateListSkeleton
import org.jetbrains.compose.resources.stringResource
import pulsequery.composeapp.generated.resources.Res
import pulsequery.composeapp.generated.resources.all_categories
import pulsequery.composeapp.generated.resources.allow_natural_text_label
import pulsequery.composeapp.generated.resources.back
import pulsequery.composeapp.generated.resources.configure_widget
import pulsequery.composeapp.generated.resources.create_widget_button
import pulsequery.composeapp.generated.resources.creating_widget
import pulsequery.composeapp.generated.resources.creation_source
import pulsequery.composeapp.generated.resources.custom_widget_builder
import pulsequery.composeapp.generated.resources.endpoint_url_label
import pulsequery.composeapp.generated.resources.http_verb
import pulsequery.composeapp.generated.resources.loading_templates
import pulsequery.composeapp.generated.resources.markdown_content_label
import pulsequery.composeapp.generated.resources.natural_text_prompt_label
import pulsequery.composeapp.generated.resources.no_templates_found
import pulsequery.composeapp.generated.resources.ok
import pulsequery.composeapp.generated.resources.parameters
import pulsequery.composeapp.generated.resources.processor_label
import pulsequery.composeapp.generated.resources.retry
import pulsequery.composeapp.generated.resources.search_templates
import pulsequery.composeapp.generated.resources.search_templates_input
import pulsequery.composeapp.generated.resources.select_processor_content_desc
import pulsequery.composeapp.generated.resources.source_custom_http
import pulsequery.composeapp.generated.resources.source_custom_sql
import pulsequery.composeapp.generated.resources.source_custom_text
import pulsequery.composeapp.generated.resources.source_templates
import pulsequery.composeapp.generated.resources.sql_query_label
import pulsequery.composeapp.generated.resources.template_marketplace
import pulsequery.composeapp.generated.resources.visualization_format
import pulsequery.composeapp.generated.resources.visualization_type
import pulsequery.composeapp.generated.resources.widget_created_success
import pulsequery.composeapp.generated.resources.widget_subtitle_label
import pulsequery.composeapp.generated.resources.widget_subtitle_placeholder
import pulsequery.composeapp.generated.resources.widget_title

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
        is WizardState.CustomWidgetConfiguration -> stringResource(Res.string.custom_widget_builder)
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
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Spacer(modifier = Modifier.height(8.dp))
                        CircularProgressIndicator()
                        Text(stringResource(Res.string.loading_templates))
                        TemplateListSkeleton()
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
                        onSubtitleChanged = { vm.updateWidgetSubtitle(it) },
                        onVisualizationChanged = { vm.updateVisualization(it) },
                        onParameterChanged = { k, v -> vm.updateParameterValue(k, v) },
                        onAllowNaturalTextChanged = { vm.updateAllowNaturalText(it) },
                        onProcessorSelected = { vm.selectProcessor(it) },
                        onNaturalTextPromptChanged = { vm.updateNaturalTextPrompt(it) },
                        onSubmit = { vm.submitWidget { onComplete() } },
                        onBack = { vm.backToTemplates() }
                    )
                }

                is WizardState.CustomWidgetConfiguration -> {
                    CustomWidgetConfigurationContent(
                        state = s,
                        onTitleChanged = { vm.updateCustomWidgetTitle(it) },
                        onSubtitleChanged = { vm.updateWidgetSubtitle(it) },
                        onContentChanged = { vm.updateCustomWidgetContent(it) },
                        onVisualizationChanged = { vm.updateCustomWidgetViz(it) },
                        onHttpMethodChanged = { vm.updateCustomWidgetHttpMethod(it) },
                        onAllowNaturalTextChanged = { vm.updateAllowNaturalText(it) },
                        onProcessorSelected = { vm.selectProcessor(it) },
                        onNaturalTextPromptChanged = { vm.updateNaturalTextPrompt(it) },
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
                text = stringResource(Res.string.creation_source),
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
                    label = { Text(stringResource(Res.string.source_templates)) }
                )
                FilterChip(
                    selected = false,
                    onClick = { onStartCustom("SQL") },
                    label = { Text(stringResource(Res.string.source_custom_sql)) }
                )
                FilterChip(
                    selected = false,
                    onClick = { onStartCustom("HTTP") },
                    label = { Text(stringResource(Res.string.source_custom_http)) }
                )
                FilterChip(
                    selected = false,
                    onClick = { onStartCustom("TEXT") },
                    label = { Text(stringResource(Res.string.source_custom_text)) }
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        item {
            val searchTemplatesDesc = stringResource(Res.string.search_templates_input)
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = onSearchChanged,
                placeholder = { Text(stringResource(Res.string.search_templates)) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = searchTemplatesDesc }
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
 * Renders the processor selection dropdown (`SQL [no model]`, Ollama models, `any-llm` models)
 * and interactive natural-text toggle for SQL widgets.
 *
 * @param availableProcessors List of selectable [ProcessorSelectionOption] items.
 * @param allowNaturalText Whether interactive natural text entry is enabled.
 * @param selectedProcessor Currently selected [ProcessorId].
 * @param naturalTextPrompt Default natural text prompt string.
 * @param onAllowNaturalTextChanged Callback invoked when the natural text switch changes.
 * @param onProcessorSelected Callback invoked when a processor option is selected.
 * @param onNaturalTextPromptChanged Callback invoked when the default natural text prompt changes.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProcessorNaturalTextSection(
    availableProcessors: List<ProcessorSelectionOption>,
    allowNaturalText: Boolean,
    selectedProcessor: ProcessorId,
    naturalTextPrompt: String,
    onAllowNaturalTextChanged: (Boolean) -> Unit,
    onProcessorSelected: (ProcessorId) -> Unit,
    onNaturalTextPromptChanged: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedDisplay = availableProcessors.firstOrNull { it.id == selectedProcessor }?.displayName
        ?: selectedProcessor.value
    val toggleLabel = stringResource(Res.string.allow_natural_text_label)
    val procDesc = stringResource(Res.string.select_processor_content_desc)

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = toggleLabel,
                style = MaterialTheme.typography.bodyMedium
            )
            Switch(
                checked = allowNaturalText,
                onCheckedChange = onAllowNaturalTextChanged,
                modifier = Modifier.semantics { contentDescription = toggleLabel }
            )
        }

        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it }
        ) {
            OutlinedTextField(
                value = selectedDisplay,
                onValueChange = {},
                readOnly = true,
                label = { Text(stringResource(Res.string.processor_label)) },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier
                    .fillMaxWidth()
                    .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
                    .semantics { contentDescription = procDesc }
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false }
            ) {
                availableProcessors.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(option.displayName) },
                        onClick = {
                            onProcessorSelected(option.id)
                            expanded = false
                        }
                    )
                }
            }
        }

        if (allowNaturalText) {
            OutlinedTextField(
                value = naturalTextPrompt,
                onValueChange = onNaturalTextPromptChanged,
                label = { Text(stringResource(Res.string.natural_text_prompt_label)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
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
 * @param onSubtitleChanged Callback when widget subtitle/caption is updated.
 * @param onAllowNaturalTextChanged Callback when natural-text mode is toggled.
 * @param onProcessorSelected Callback when a query processor is selected.
 * @param onNaturalTextPromptChanged Callback when the default natural text prompt changes.
 */
@Composable
fun ParameterConfigurationContent(
    state: WizardState.ParameterConfiguration,
    onTitleChanged: (String) -> Unit,
    onVisualizationChanged: (String) -> Unit,
    onParameterChanged: (String, String) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    onSubtitleChanged: (String) -> Unit = {},
    onAllowNaturalTextChanged: (Boolean) -> Unit = {},
    onProcessorSelected: (ProcessorId) -> Unit = {},
    onNaturalTextPromptChanged: (String) -> Unit = {}
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
            OutlinedTextField(
                value = state.widgetSubtitle,
                onValueChange = onSubtitleChanged,
                label = { Text(stringResource(Res.string.widget_subtitle_label)) },
                placeholder = { Text(stringResource(Res.string.widget_subtitle_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        item {
            ProcessorNaturalTextSection(
                availableProcessors = state.availableProcessors,
                allowNaturalText = state.allowNaturalText,
                selectedProcessor = state.selectedProcessor,
                naturalTextPrompt = state.naturalTextPrompt,
                onAllowNaturalTextChanged = onAllowNaturalTextChanged,
                onProcessorSelected = onProcessorSelected,
                onNaturalTextPromptChanged = onNaturalTextPromptChanged
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
 * @param onSubtitleChanged Callback when widget subtitle/caption is modified.
 * @param onAllowNaturalTextChanged Callback when natural-text mode is toggled.
 * @param onProcessorSelected Callback when a query processor is selected.
 * @param onNaturalTextPromptChanged Callback when the default natural text prompt changes.
 */
@Composable
fun CustomWidgetConfigurationContent(
    state: WizardState.CustomWidgetConfiguration,
    onTitleChanged: (String) -> Unit,
    onContentChanged: (String) -> Unit,
    onVisualizationChanged: (String) -> Unit,
    onHttpMethodChanged: (String) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
    onSubtitleChanged: (String) -> Unit = {},
    onAllowNaturalTextChanged: (Boolean) -> Unit = {},
    onProcessorSelected: (ProcessorId) -> Unit = {},
    onNaturalTextPromptChanged: (String) -> Unit = {}
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
                label = { Text(stringResource(Res.string.widget_title)) },
                isError = state.fieldErrors.containsKey("title"),
                supportingText = state.fieldErrors["title"]?.let { { Text(it) } },
                modifier = Modifier.fillMaxWidth()
            )
        }

        item {
            OutlinedTextField(
                value = state.widgetSubtitle,
                onValueChange = onSubtitleChanged,
                label = { Text(stringResource(Res.string.widget_subtitle_label)) },
                placeholder = { Text(stringResource(Res.string.widget_subtitle_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        if (state.creationType == "SQL") {
            item {
                ProcessorNaturalTextSection(
                    availableProcessors = state.availableProcessors,
                    allowNaturalText = state.allowNaturalText,
                    selectedProcessor = state.selectedProcessor,
                    naturalTextPrompt = state.naturalTextPrompt,
                    onAllowNaturalTextChanged = onAllowNaturalTextChanged,
                    onProcessorSelected = onProcessorSelected,
                    onNaturalTextPromptChanged = onNaturalTextPromptChanged
                )
            }
        }

        if (state.creationType == "HTTP") {
            item {
                Text(
                    text = stringResource(Res.string.http_verb),
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
                "HTTP" -> stringResource(Res.string.endpoint_url_label)
                "TEXT" -> stringResource(Res.string.markdown_content_label)
                else -> stringResource(Res.string.sql_query_label)
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
                text = stringResource(Res.string.visualization_format),
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
                    Text(stringResource(Res.string.create_widget_button))
                }
            }
        }
    }
}
