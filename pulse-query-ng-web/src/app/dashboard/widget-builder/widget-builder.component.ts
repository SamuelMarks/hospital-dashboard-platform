/**
 * @fileoverview Dialog-based wizard for creating and configuring dashboard widgets.
 *
 * Delegates reactive wizard state, template marketplace search, client-memory draft
 * configuration, and single-query preview execution (`/api/v1/ai/execute`) to `WidgetBuilderStore`.
 */
import { Component, computed, inject, OnInit } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { form, required } from '@angular/forms/signals';

// Material Imports
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { provideNativeDateAdapter } from '@angular/material/core';

// Core Imports
import { TemplateResponse } from '../../api-client';
import { DashboardStore } from '../dashboard.store';
import { ProcessorCatalogService } from '../../shared/services/processor-catalog.service';
import { extractEventInputValue } from '../../shared/utils/dom-event.utils';

// Component & Store Imports
import { SqlBuilderComponent } from '../../editors/sql-builder.component';
import { HttpConfigComponent } from '../../editors/http-config.component';
import { TextEditorComponent } from '../../editors/text-editor.component';
import { WidgetBuilderMarketplaceStepComponent } from './widget-builder-marketplace-step.component';
import { WidgetBuilderCustomSourceStepComponent } from './widget-builder-custom-source-step.component';
import {
  VisualizationOption,
  WidgetBuilderVisualizeStepComponent,
} from './widget-builder-visualize-step.component';
import { WidgetBuilderStore } from './widget-builder.store';

/**
 * Data injected into the Widget Builder Dialog.
 */
export interface WidgetBuilderData {
  /** The ID of the dashboard being edited. */
  dashboardId: string;
}

/**
 * Widget Builder Component.
 *
 * A dialog-based wizard for creating and configuring new dashboard widgets.
 */
@Component({
  selector: 'app-widget-builder',
  imports: [
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    SqlBuilderComponent,
    HttpConfigComponent,
    TextEditorComponent,
    WidgetBuilderMarketplaceStepComponent,
    WidgetBuilderCustomSourceStepComponent,
    WidgetBuilderVisualizeStepComponent,
  ],
  providers: [provideNativeDateAdapter(), WidgetBuilderStore],
  host: {
    '(keydown.escape)': 'cancel()',
  },
  templateUrl: './widget-builder.component.html',
  styles: [
    `
      :host {
        display: block;
        height: 85vh;
        width: 100vw;
        max-width: 1200px;
        background-color: var(--sys-background);
      }

      /* Dialog Header Override */
      .dialog-header {
        background-color: var(--sys-surface);
        color: var(--sys-text-primary);
        border-bottom: 1px solid var(--sys-surface-border);
      }
    `,
  ],
})
export class WidgetBuilderComponent implements OnInit {
  /** Injected data containing dashboard context. */
  readonly data = inject<WidgetBuilderData>(MAT_DIALOG_DATA);
  /** Reference to the hosting dialog. */
  private readonly dialogRef = inject(MatDialogRef<WidgetBuilderComponent>);
  /** Extracted wizard state and preview execution store. */
  readonly builderStore = inject(WidgetBuilderStore);
  /** Centralized reactive state store for the active hospital dashboard. */
  readonly store = inject(DashboardStore);
  /** Processor catalog service providing `SQL [no model]`, Ollama models, and `any-llm` models. */
  readonly processorCatalog = inject(ProcessorCatalogService);
  /** Injected DOM document reference for focus restoration. */
  private readonly document = inject(DOCUMENT);
  /** Element that held focus before the WidgetBuilder dialog opened. */
  private readonly triggerElement: HTMLElement | null =
    this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;

  /** Active wizard mode (Template vs Custom). */
  readonly activeMode = this.builderStore.activeMode;
  /** Currently selected template object. */
  readonly selectedTemplate = this.builderStore.selectedTemplate;
  /** Currently selected custom type. */
  readonly selectedCustomType = this.builderStore.selectedCustomType;
  /** The temporary widget being configured in client memory. */
  readonly draftWidget = this.builderStore.draftWidget;
  /** Whether the widget allows the user to enter natural text on the dashboard. */
  readonly allowNaturalText = this.builderStore.allowNaturalText;
  /** Selected processor ID (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`). */
  readonly selectedProcessor = this.builderStore.selectedProcessor;
  /** Default or saved natural text prompt for this widget. */
  readonly naturalTextPrompt = this.builderStore.naturalTextPrompt;
  /** Optional custom placeholder text for the widget's natural text input. */
  readonly placeholderText = this.builderStore.placeholderText;

  /** List of available templates. */
  readonly templates = this.builderStore.templates;
  /** Template loading state. */
  readonly loadingTemplates = this.builderStore.loadingTemplates;
  /** Global busy/saving state. */
  readonly isBusy = this.builderStore.isBusy;
  /** Filter categories for templates. */
  readonly categories = this.builderStore.categories;
  /** Currently active category filter. */
  readonly selectedCategory = this.builderStore.selectedCategory;
  /** Reactive search query signal. */
  readonly searchQuery = this.builderStore.searchQuery;

  /** ID of the selected template. */
  readonly selectedTemplateId = this.builderStore.selectedTemplateId;
  /** ID of the current draft widget. */
  readonly draftWidgetId = this.builderStore.draftWidgetId;
  /** Parameters schema from selected template. */
  readonly paramsSchema = this.builderStore.paramsSchema;
  /** Current widget type active in the builder. */
  readonly currentType = this.builderStore.currentType;
  /** Alias for template usage to match `selectedType()` calls in HTML. */
  readonly selectedType = this.builderStore.selectedType;

  /** Parameter values for template injection. */
  readonly templateParams = this.builderStore.templateParams;
  /** Validity of the parameter form. */
  readonly templateFormValid = this.builderStore.templateFormValid;
  /** Signal model for visual configurations. */
  readonly vizFormModel = this.builderStore.vizFormModel;

  /** Signal form root for visualize step. */
  readonly vizForm = form(this.vizFormModel, (f) => {
    required(f.title);
  });

  /** Canonical list of supported visualizations. */
  readonly visualizations: VisualizationOption[] = this.builderStore.visualizations;
  /** Whether to show axis config options. */
  readonly showAxesConfig = this.builderStore.showAxesConfig;
  /** Whether visualization is Pie chart. */
  readonly isPie = this.builderStore.isPie;
  /** Available columns from execution result. */
  readonly availableColumns = this.builderStore.availableColumns;
  /** Whether data config step is valid. */
  readonly dataConfigured = this.builderStore.dataConfigured;
  /** Final compiled SQL string. */
  readonly finalSql = this.builderStore.finalSql;
  /** Latest single-query execution result. */
  readonly executionResult = this.builderStore.executionResult;
  /** Strongly typed computed table dataset derived from `executionResult`. */
  readonly previewTableData = this.builderStore.previewTableData;
  /** Active Tab Index. */
  readonly selectedTab = this.builderStore.selectedTab;
  /** Computed widget snapshot merging `draftWidget` with `vizFormModel`. */
  readonly previewWidget = this.builderStore.previewWidget;
  /** Computed SQL query string extracted safely from `draftWidget().config['query']`. */
  readonly draftSqlQuery = computed(() => {
    const q = this.draftWidget()?.config?.['query'];
    return typeof q === 'string' ? q : '';
  });
  /** Computed markdown content string extracted safely from `draftWidget().config['content']`. */
  readonly draftTextContent = computed(() => {
    const c = this.draftWidget()?.config?.['content'];
    return typeof c === 'string' ? c : '';
  });

  /** Loads initial widget templates and available processors. */
  ngOnInit(): void {
    this.loadTemplates();
    this.processorCatalog.loadProcessors();
  }

  /**
   * Returns a localized accessible label for a template card.
   *
   * @param t - The template response object.
   * @returns Localized ARIA label string.
   */
  getTemplateAriaLabel(t: TemplateResponse): string {
    return $localize`Select template: ${t.title}`;
  }

  /**
   * Updates the widget title in `vizFormModel`.
   *
   * @param title - Updated widget title string.
   */
  updateTitle(title: string): void {
    this.vizFormModel.update((m) => ({ ...m, title }));
  }

  /**
   * Updates the widget subtitle/caption in `vizFormModel`.
   *
   * @param subtitle - Updated widget subtitle string.
   */
  updateSubtitle(subtitle: string): void {
    this.vizFormModel.update((m) => ({ ...m, subtitle }));
  }

  /**
   * Updates the selected X-axis column in `vizFormModel`.
   *
   * @param xKey - Selected X-axis column name or null.
   */
  updateXKey(xKey: string | null): void {
    this.vizFormModel.update((m) => ({ ...m, xKey }));
  }

  /**
   * Updates the selected Y-axis column in `vizFormModel`.
   *
   * @param yKey - Selected Y-axis column name or null.
   */
  updateYKey(yKey: string | null): void {
    this.vizFormModel.update((m) => ({ ...m, yKey }));
  }

  /**
   * Updates whether the widget allows natural text entry on the dashboard.
   *
   * @param allowed - True if interactive natural text entry is enabled.
   */
  updateAllowNaturalText(allowed: boolean): void {
    this.allowNaturalText.set(allowed);
  }

  /**
   * Updates the selected processor (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`).
   *
   * @param processor - Selected processor ID.
   */
  updateProcessor(processor: string): void {
    this.selectedProcessor.set(processor);
  }

  /**
   * Updates the default natural text prompt for the widget.
   *
   * @param prompt - Natural text prompt string.
   */
  updateNaturalTextPrompt(prompt: string): void {
    this.naturalTextPrompt.set(prompt);
  }

  /**
   * Updates the placeholder text for the widget's natural text input.
   *
   * @param placeholder - Placeholder text string.
   */
  updatePlaceholderText(placeholder: string): void {
    this.placeholderText.set(placeholder);
  }

  /**
   * Triggers a debounced template search update from an input event.
   *
   * @param e - The DOM input event from the search field.
   */
  updateSearch(e: Event): void {
    this.builderStore.setSearchQuery(extractEventInputValue(e));
  }

  /**
   * Toggles the active template category filter and reloads templates.
   *
   * @param cat - The category name to toggle.
   */
  toggleCategory(cat: string): void {
    this.builderStore.toggleCategory(cat);
  }

  /**
   * Loads widget templates from the backend API filtered by category and search query.
   *
   * @param search - Optional search query string.
   */
  loadTemplates(search?: string): void {
    this.builderStore.loadTemplates(search);
  }

  /**
   * Selects a widget template and switches the builder into template mode.
   *
   * @param t - The selected template response object.
   */
  selectTemplate(t: TemplateResponse): void {
    this.builderStore.selectTemplate(t);
  }

  /**
   * Selects a custom widget data source type and switches the builder into custom mode.
   *
   * @param type - The custom widget type ('SQL', 'HTTP', or 'TEXT').
   */
  selectCustomType(type: 'SQL' | 'HTTP' | 'TEXT'): void {
    this.builderStore.selectCustomType(type);
  }

  /** Validates parameters based on mode. */
  parseParams(): void {
    this.builderStore.parseParams();
  }

  /** Compiles template SQL with parameters and executes single-query preview. */
  renderPreview(): void {
    this.builderStore.renderPreview();
  }

  /**
   * Updates the template parameter values from the dynamic form.
   *
   * @param values - Key-value map of template parameter values.
   */
  handleFormChange(values: Record<string, unknown>): void {
    this.templateParams.set(values);
  }

  /**
   * Updates the validity state of the dynamic template parameter form.
   *
   * @param status - Form validation status ('VALID' or 'INVALID').
   */
  handleStatusChange(status: 'VALID' | 'INVALID'): void {
    this.templateFormValid.set(status === 'VALID');
  }

  /**
   * Initializes the draft widget in client memory and advances the wizard stepper.
   *
   * @param stepper - Optional Material stepper instance to advance.
   */
  initializeDraft(stepper?: Pick<MatStepper, 'next'>): void {
    this.builderStore.initializeDraft(this.data.dashboardId, stepper);
  }

  /**
   * Injects template parameters into the SQL template, runs single-query preview, and advances the stepper.
   *
   * @param stepper - Material stepper instance to advance once the query executes.
   */
  runTemplateQuery(stepper: Pick<MatStepper, 'next'>): void {
    this.builderStore.runTemplateQuery(stepper);
  }

  /**
   * Validates or previews the draft widget's data and advances the stepper to the visualization step.
   *
   * @param stepper - Material stepper instance to advance.
   */
  validateDataPresence(stepper: Pick<MatStepper, 'next'>): void {
    this.builderStore.validateDataPresence(stepper);
  }

  /**
   * Updates the draft widget's SQL query when modified in the SQL editor.
   *
   * @param newSql - Updated SQL query string.
   */
  onSqlChange(newSql: string): void {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, query: newSql } });
  }

  /**
   * Merges updated HTTP configuration properties into the draft widget.
   *
   * @param newConfig - Updated configuration dictionary from the HTTP editor.
   */
  onConfigChange(newConfig: Record<string, unknown>): void {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, ...newConfig } });
  }

  /**
   * Updates the markdown content of a TEXT draft widget.
   *
   * @param content - Updated markdown text content.
   */
  onContentChange(content: string): void {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, content } });
  }

  /**
   * Updates the selected visualization type ID on the draft widget.
   *
   * @param id - The visualization type identifier (e.g., 'table', 'bar_chart', 'pie_chart').
   */
  updateVizType(id: string): void {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, visualization: id });
  }

  /**
   * Synchronizes X and Y axis column mappings into the draft widget configuration.
   *
   * @param xKey - Selected X-axis column name or null.
   * @param yKey - Selected Y-axis column name or null.
   */
  syncVizConfig(xKey: string | null, yKey: string | null): void {
    const w = this.draftWidget();
    if (!w) return;

    if (w.config?.['xKey'] === xKey && w.config?.['yKey'] === yKey) return;

    const currentConfig = { ...w.config };
    currentConfig['xKey'] = xKey;
    currentConfig['yKey'] = yKey;

    this.draftWidget.set({ ...w, config: currentConfig });
  }

  /** Saves and closes dialog. */
  saveWidget(): void {
    this.saveAndClose();
  }

  /** Persists widget to backend and closes. */
  saveAndClose(): void {
    this.builderStore.saveAndClose(this.data.dashboardId, () => {
      this.dialogRef.close(true);
      this.restoreTriggerFocus();
    });
  }

  /** Cancels creation process and restores focus to the trigger button. */
  cancel(): void {
    this.builderStore.cancelDraft();
    this.dialogRef.close(false);
    this.restoreTriggerFocus();
  }

  /**
   * Restores keyboard focus to the trigger element that opened the dialog.
   */
  restoreTriggerFocus(): void {
    if (this.triggerElement && typeof this.triggerElement.focus === 'function') {
      this.triggerElement.focus();
    }
  }

  /**
   * Normalizes an execution result payload into a strongly typed table dataset.
   *
   * @param res - The execution result payload.
   * @returns Table dataset with defined columns and data rows.
   */
  asTableData(res: { columns?: string[]; data?: Record<string, unknown>[] } | null | undefined): {
    columns: string[];
    data: Record<string, unknown>[];
  } {
    if (!res) {
      return this.previewTableData();
    }
    return {
      columns: res.columns ?? [],
      data: res.data ?? [],
    };
  }
}
