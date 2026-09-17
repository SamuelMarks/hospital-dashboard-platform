/**
 * Wizard state modeling module for multi-step and multi-modal widget creation.
 */
package io.healthplatform.pulsequery.ui.screens.wizard

import io.healthplatform.pulsequery.api.models.TemplateResponse
import io.healthplatform.pulsequery.api.models.WidgetResponse

/**
 * Representation of an individual dynamic parameter field extracted from a template's schema.
 *
 * @property key The parameter identifier matching the handlebars placeholder.
 * @property title The display label for the input field.
 * @property type The parameter datatype (e.g., string, integer, number).
 * @property defaultValue The default initial value for the field.
 * @property isRequired Whether this parameter must be populated before widget creation.
 */
data class ParameterField(
    val key: String,
    val title: String,
    val type: String,
    val defaultValue: String,
    val isRequired: Boolean
)

/**
 * Sealed class hierarchy modeling the state transitions of the Widget Creation Wizard.
 */
sealed class WizardState {

    /**
     * Initial loading state while fetching available templates from the API.
     */
    data object Loading : WizardState()

    /**
     * State presenting the template marketplace for category filtering and template selection.
     *
     * @property templates All available templates fetched from the server.
     * @property categories Distinct category names derived from the templates.
     * @property selectedCategory Currently active category filter, or null for all.
     * @property searchQuery Current search term filtering titles and descriptions.
     * @property filteredTemplates The templates matching the active category and search term.
     */
    data class TemplateSelection(
        val templates: List<TemplateResponse>,
        val categories: List<String>,
        val selectedCategory: String? = null,
        val searchQuery: String = "",
        val filteredTemplates: List<TemplateResponse> = templates
    ) : WizardState()

    /**
     * State presenting configuration form fields for the selected template.
     *
     * @property template The chosen template being configured.
     * @property widgetTitle The custom or default title of the widget.
     * @property visualization The visualization type (e.g., bar_chart, line_chart, table, metric).
     * @property parameterFields Extracted dynamic fields based on parameters_schema.
     * @property parameterValues Current user-entered values mapped by parameter key.
     * @property fieldErrors Map of parameter key or field name to validation error message.
     */
    data class ParameterConfiguration(
        val template: TemplateResponse,
        val widgetTitle: String,
        val visualization: String,
        val parameterFields: List<ParameterField>,
        val parameterValues: Map<String, String>,
        val fieldErrors: Map<String, String> = emptyMap()
    ) : WizardState()

    /**
     * State presenting creation form fields for custom SQL, HTTP, or Markdown Text widgets.
     *
     * @property creationType Widget source type ("SQL", "HTTP", or "TEXT").
     * @property widgetTitle Display title of the widget.
     * @property visualization Chosen visualization mode.
     * @property queryOrUrlOrContent Query text, endpoint URL, or Markdown text content.
     * @property httpMethod HTTP Verb for HTTP widgets (e.g., GET, POST).
     * @property fieldErrors Map of field validation error messages.
     */
    data class CustomWidgetConfiguration(
        val creationType: String,
        val widgetTitle: String = "",
        val visualization: String = "table",
        val queryOrUrlOrContent: String = "",
        val httpMethod: String = "GET",
        val fieldErrors: Map<String, String> = emptyMap()
    ) : WizardState()

    /**
     * State indicating that widget creation is actively in flight.
     *
     * @property message Status message displayed during submission.
     */
    data class Submitting(val message: String = "Creating widget...") : WizardState()

    /**
     * Terminal success state indicating the widget was created and persisted.
     *
     * @property widget The newly created widget returned from the server.
     */
    data class Success(val widget: WidgetResponse) : WizardState()

    /**
     * Error state displaying a failure message and allowing retry.
     *
     * @property message Explanatory failure message.
     */
    data class Error(val message: String) : WizardState()
}
