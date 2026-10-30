/**
 * @fileoverview Widget Creation Wizard Component.
 *
 * Orchestrates a stateless multi-step widget creation flow:
 * 1. Select Marketplace Template or enter Custom SQL.
 * 2. Configure template parameters via `DynamicFormComponent`.
 * 3. Execute a stateless read-only SQL preview via `AiService.executeSqlPreviewApiV1AiExecutePost`.
 * 4. Persist the new widget on the target dashboard only when the user confirms "Add Widget".
 */

import { Component, DestroyRef, computed, inject, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormRoot, FormField, form, required } from '@angular/forms/signals';
import { finalize, debounceTime, distinctUntilChanged, skip } from 'rxjs/operators';

import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { provideNativeDateAdapter } from '@angular/material/core';

import {
  AiService,
  DashboardsService,
  SQLExecutionResponse,
  TemplatesService,
  TemplateResponse,
  WidgetCreateSql,
} from '../../api-client';
import { DynamicFormComponent } from './dynamic-form.component';
import {
  TemplatePreviewExecutionResult,
  TemplateWizardPreviewStepComponent,
} from './template-wizard-preview-step.component';
import { WidgetBuilderMarketplaceStepComponent } from '../widget-builder/widget-builder-marketplace-step.component';
import { TemplateConfigurationService } from '../template-configuration.service';
import { extractEventInputValue } from '../../shared/utils/dom-event.utils';

/**
 * Dialog input data passed to `TemplateWizardComponent`.
 */
export interface WizardData {
  /** Target dashboard UUID where the finalized widget will be created. */
  dashboardId: string;
}

/**
 * Multi-step dialog wizard for instantiating SQL widgets from marketplace templates or custom SQL.
 */
@Component({
  selector: 'app-template-wizard',
  providers: [provideNativeDateAdapter()],
  host: {
    '(keydown.escape)': 'cancel()',
  },
  imports: [
    FormRoot,
    FormField,
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatCardModule,
    DynamicFormComponent,
    TemplateWizardPreviewStepComponent,
    WidgetBuilderMarketplaceStepComponent,
  ],
  templateUrl: './template-wizard.component.html',
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        width: 1000px;
        height: 85vh;
        max-height: 900px;
      }
      .template-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        align-content: start;
      }
      .template-card {
        cursor: pointer;
        height: 140px;
        display: flex;
        flex-direction: column;
        transition: all 0.2s;
        border: 1px solid transparent;
      }
      .template-card.selected-card {
        background-color: var(--sys-selected);
        border-color: var(--sys-primary) !important;
      }
      .template-card:hover:not(.selected-card) {
        border-color: var(--sys-surface-border);
        background-color: var(--sys-hover);
      }
    `,
  ],
})
export class TemplateWizardComponent implements OnInit {
  /** DestroyRef for automatic RxJS stream teardown. */
  private readonly destroyRef = inject(DestroyRef);

  /** Hosting dialog reference. */
  private readonly dialogRef = inject(MatDialogRef<TemplateWizardComponent>);

  /** Generated OpenAPI dashboards service used on final widget creation. */
  private readonly dashboardsApi = inject(DashboardsService);

  /** Generated OpenAPI AI service used for stateless read-only SQL previews. */
  private readonly aiApi = inject(AiService);

  /** Generated OpenAPI templates service used to query the marketplace catalog. */
  private readonly templatesApi = inject(TemplatesService);

  /** Shared template parameter and SQL interpolation service. */
  private readonly templateConfig = inject(TemplateConfigurationService);

  /** Injected dialog configuration containing `dashboardId`. */
  private readonly data = inject<WizardData>(MAT_DIALOG_DATA);

  /** Marketplace templates loaded from the backend. */
  readonly templates = signal<TemplateResponse[]>([]);

  /** Available template category filter chips. */
  readonly categories = signal<string[]>([
    'Predictive',
    'Operational',
    'Capacity',
    'Clinical',
    'Financial',
  ]);

  /** Whether a template list fetch is currently in progress. */
  readonly loadingTemplates = signal<boolean>(false);

  /** Currently selected category chip filter, or `null` for all categories. */
  readonly selectedCategory = signal<string | null>(null);

  /** ID of the currently selected marketplace template. */
  readonly selectedTemplateId = signal<string | null>(null);

  /** Reactive signal holding the current marketplace search input string. */
  readonly searchQuery = signal<string>('');

  /** JSON Schema for the selected template's parameters. */
  readonly paramsSchema = signal<Record<string, unknown>>({});

  /** Interpolated SQL query string ready for preview and saving. */
  readonly finalSql = signal<string>('');

  /** Whether a preview query or widget creation call is currently running. */
  readonly isRunning = signal<boolean>(false);

  /** Latest stateless SQL preview result or error message. */
  readonly executionResult = signal<TemplatePreviewExecutionResult | null>(null);

  /** Current parameter values emitted by `DynamicFormComponent`. */
  readonly paramsValue = signal<Record<string, unknown>>({});

  /** Whether the dynamic parameter form is currently valid. */
  readonly paramsValid = signal<boolean>(false);

  /** Signal backing the step-1 mode and SQL selection form. */
  readonly formModel = signal({
    mode: 'predefined',
    templateId: '',
    rawSql: '',
  });

  /** Signal form instance for step 1. */
  readonly selectionForm = form(this.formModel, (f) => {
    required(f.mode);
  });

  /** Placeholder hint shown in the custom SQL textarea. */
  readonly placeholderText = "SELECT * FROM table WHERE col = '{{param}}'";

  /**
   * Initializes the debounced search query stream using `toObservable` and `takeUntilDestroyed`.
   */
  constructor() {
    toObservable(this.searchQuery)
      .pipe(skip(1), debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => this.loadTemplates(term));
  }

  /**
   * Loads initial marketplace templates on component initialization.
   */
  ngOnInit(): void {
    this.loadTemplates();
  }

  /**
   * Computed signal indicating whether step 1 has a valid template or custom SQL selection.
   */
  readonly selectionValid = computed((): boolean => {
    const val = this.formModel();
    if (val.mode === 'predefined') {
      return Boolean(val.templateId);
    }
    return Boolean(val.rawSql && val.rawSql.trim().length > 0);
  });

  /**
   * Fetches marketplace templates filtered by `selectedCategory()` and optional `searchTerm`.
   *
   * @param searchTerm - Optional search substring.
   */
  loadTemplates(searchTerm?: string): void {
    this.loadingTemplates.set(true);
    const cat = this.selectedCategory() || undefined;
    const search = searchTerm && searchTerm.trim().length > 0 ? searchTerm : undefined;

    this.templatesApi
      .listTemplatesApiV1TemplatesGet(cat, search, 30)
      .pipe(finalize(() => this.loadingTemplates.set(false)))
      .subscribe({
        next: (data) => this.templates.set(data),
        error: (err: unknown) => console.error('Failed to load templates', err),
      });
  }

  /**
   * Selects a marketplace template and populates its SQL template and parameter schema.
   *
   * @param template - Chosen `TemplateResponse`.
   */
  selectTemplate(template: TemplateResponse): void {
    this.selectedTemplateId.set(template.id);
    this.formModel.update((m) => ({
      ...m,
      templateId: template.id,
      rawSql: template.sql_template,
    }));
    const schema = template.parameters_schema || {};
    this.paramsSchema.set(schema);
    this.paramsValue.set(this.templateConfig.extractDefaultParameters(schema));
  }

  /**
   * Toggles a category filter chip and reloads the template catalog.
   *
   * @param cat - Category name to toggle.
   */
  toggleCategory(cat: string): void {
    const newCat = this.selectedCategory() === cat ? null : cat;
    this.selectedCategory.set(newCat);
    this.loadTemplates();
  }

  /**
   * Pushes the current search input text into the reactive `searchQuery` signal.
   *
   * @param event - DOM input event from the search field.
   */
  updateSearch(event: Event): void {
    this.searchQuery.set(extractEventInputValue(event));
  }

  /**
   * Prepares parameter schema state when advancing from step 1 to step 2.
   */
  parseParams(): void {
    const mode = this.formModel().mode;
    if (mode !== 'predefined') {
      this.paramsSchema.set({});
      this.paramsValid.set(true);
    } else if (!this.templateConfig.hasSchemaParameters(this.paramsSchema())) {
      this.paramsValid.set(true);
    }
  }

  /**
   * Updates `paramsValue` when the dynamic parameter form emits new values.
   *
   * @param values - Map of parameter names to form values.
   */
  handleFormChange(values: Record<string, unknown>): void {
    this.paramsValue.set(values);
  }

  /**
   * Updates `paramsValid` when the dynamic parameter form validation status changes.
   *
   * @param status - Validation status (`'VALID'` or `'INVALID'`).
   */
  handleStatusChange(status: 'VALID' | 'INVALID'): void {
    this.paramsValid.set(status === 'VALID');
  }

  /**
   * Interpolates parameters into the template SQL and executes a stateless preview query.
   */
  renderPreview(): void {
    const sql = this.templateConfig.interpolateSql(
      this.formModel().rawSql || '',
      this.paramsValue(),
    );
    this.finalSql.set(sql);
    this.executePreview(sql);
  }

  /**
   * Executes a stateless SQL preview via `AiService.executeSqlPreviewApiV1AiExecutePost`.
   *
   * @param sql - Interpolated SQL query string to preview.
   */
  private executePreview(sql: string): void {
    if (!sql.trim()) {
      this.executionResult.set({ data: [], columns: [] });
      return;
    }

    this.isRunning.set(true);
    this.aiApi
      .executeSqlPreviewApiV1AiExecutePost({ sql, max_rows: 100 })
      .pipe(finalize(() => this.isRunning.set(false)))
      .subscribe({
        next: (res: SQLExecutionResponse) => {
          this.executionResult.set({
            data: res.data,
            columns: res.columns,
            error: res.error ?? null,
          });
        },
        error: () => {
          this.executionResult.set({ error: $localize`Failed to execute query` });
        },
      });
  }

  /**
   * Persists the configured SQL widget to the target dashboard and closes the wizard dialog.
   */
  saveWidget(): void {
    const query = this.finalSql().trim();
    if (!query) {
      return;
    }

    let title = $localize`Custom SQL Widget`;
    let visualization = 'table';
    if (this.formModel().mode === 'predefined') {
      const selected = this.templates().find((x) => x.id === this.formModel().templateId);
      if (selected) {
        title = selected.title;
        visualization = this.templateConfig.inferVisualization(selected);
      }
    }

    const createReq: WidgetCreateSql = {
      title,
      type: 'SQL',
      visualization,
      config: { query },
    };

    this.isRunning.set(true);
    this.dashboardsApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(this.data.dashboardId, createReq)
      .pipe(finalize(() => this.isRunning.set(false)))
      .subscribe(() => {
        this.dialogRef.close(true);
      });
  }

  /**
   * Cancels the wizard without persisting any widget to the dashboard.
   */
  cancel(): void {
    this.dialogRef.close(false);
  }
}
