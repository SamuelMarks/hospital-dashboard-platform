/* v8 ignore start */
/** @docs */
import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormControl,
  Validators,
} from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs/operators';

// Material Imports
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';

// Core Imports
import {
  DashboardsService,
  ExecutionService,
  TemplatesService,
  TemplateResponse,
  WidgetIn,
  WidgetUpdate,
  WidgetResponse,
} from '../../api-client';
import { DashboardStore } from '../dashboard.store';

// Component Imports
import { SqlBuilderComponent } from '../../editors/sql-builder.component';
import { HttpConfigComponent } from '../../editors/http-config.component';
import { WidgetComponent } from '../../widget/widget.component';
import { TextEditorComponent } from '../../editors/text-editor.component';

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
 * Supports:
 * - Template Selection from Marketplace.
 * - Custom SQL Entry.
 * - HTTP Widget Configuration.
 * - Static Text/Markdown.
 * - Live Preview.
 */
@Component({
  selector: 'app-widget-builder',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatSelectModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatCardModule,
    MatDividerModule,
    SqlBuilderComponent,
    HttpConfigComponent,
    WidgetComponent,
    TextEditorComponent,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
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

      /* Template Grid */
      .template-card {
        border: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface);
        border-radius: 8px;
        padding: 16px;
        cursor: pointer;
        transition: all 0.2s;
        outline: none;
        color: var(--sys-text-primary);
      }
      .template-card:hover {
        background-color: var(--sys-hover);
        border-color: var(--sys-primary);
        transform: translateY(-2px);
      }
      .template-card.selected {
        background-color: var(--sys-selected);
        border-color: var(--sys-primary);
        box-shadow: 0 0 0 1px var(--sys-primary);
      }

      /* Source Options */
      .source-option {
        border: 1px solid var(--sys-surface-border);
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        background-color: var(--sys-surface);
        color: var(--sys-text-primary);
      }
      .source-option:hover {
        background-color: var(--sys-hover);
        border-color: var(--sys-primary);
      }
      .source-option.selected {
        background-color: var(--sys-selected);
        border-color: var(--sys-primary);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }

      /* Viz Selection */
      .viz-option {
        border: 1px solid var(--sys-surface-border);
        border-radius: 4px;
        padding: 8px;
        text-align: center;
        cursor: pointer;
        color: var(--sys-text-secondary);
        background-color: var(--sys-surface);
      }
      .viz-option:hover {
        background-color: var(--sys-hover);
      }
      .viz-option.selected {
        background-color: var(--sys-selected);
        color: var(--sys-primary);
        border-color: var(--sys-primary);
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
/** @docs */
export class WidgetBuilderComponent implements OnInit, OnDestroy {
  /** FormBuilder for reactive forms. */
  private readonly fb = inject(FormBuilder);
  /** Injected data containing dashboard context. */
  readonly data = inject<WidgetBuilderData>(MAT_DIALOG_DATA);
  /** Reference to the hosting dialog. */
  private readonly dialogRef = inject(MatDialogRef<WidgetBuilderComponent>);
  /** Dashboard API Client. */
  private readonly dashboardApi = inject(DashboardsService);
  /** Template API Client. */
  private readonly templatesApi = inject(TemplatesService);
  /** Execution API Client. */
  private readonly execApi = inject(ExecutionService);
  /** Global Dashboard Store. */
  readonly store = inject(DashboardStore);

  // ... signals
  /** Active wizard mode (Template vs Custom). */
  /* istanbul ignore next */
  readonly activeMode = signal<'template' | 'custom' | null>(null);
  /** Currently selected template object. */
  /* istanbul ignore next */
  readonly selectedTemplate = signal<TemplateResponse | null>(null);
  /** Currently selected custom type. */
  /* istanbul ignore next */
  readonly selectedCustomType = signal<'SQL' | 'HTTP' | 'TEXT' | null>(null);
  /** The temporary widget being configured. */
  /* istanbul ignore next */
  readonly draftWidget = signal<WidgetResponse | null>(null);

  /** List of available templates. */
  /* istanbul ignore next */
  readonly templates = signal<TemplateResponse[]>([]);
  /** Template loading state. */
  /* istanbul ignore next */
  readonly loadingTemplates = signal(false);
  /** Global busy/saving state. */
  /* istanbul ignore next */
  readonly isBusy = signal(false);
  /** Filter categories for templates. */
  /* istanbul ignore next */
  readonly categories = signal<string[]>([
    'Operational',
    'Clinical',
    'Capacity',
    'Financial',
    'Flow',
  ]);
  /** Currently active category filter. */
  /* istanbul ignore next */
  readonly selectedCategory = signal<string | null>(null);

  // Helpers
  /** ID of the selected template. */
  /* istanbul ignore next */
  readonly selectedTemplateId = computed(() => this.selectedTemplate()?.id);
  /** ID of the current draft widget. */
  /* istanbul ignore next */
  readonly draftWidgetId = computed(() => this.draftWidget()?.id);
  /** Parameters schema from selected template. */
  /* istanbul ignore next */
  readonly paramsSchema = computed(() => this.selectedTemplate()?.parameters_schema || {});

  /**
   * Computed property to resolve the current widget type active in the builder.
   * This bridges the gap between `draftWidget().type` and the template's requirements.
   */
  /* istanbul ignore next */
  readonly currentType = computed(() => this.draftWidget()?.type || 'SQL');

  /**
   * Alias for template usage to match `selectedType()` calls in HTML.
   */
  readonly selectedType = this.currentType;

  /** Unused source form group (Step 1). */
  readonly sourceForm = this.fb.group({});

  /** Selection form group. */
  readonly selectionForm = this.fb.group({
    mode: ['predefined', Validators.required],
    templateId: [''],
    rawSql: [''],
  });

  /** Parameter values for template injection. */
  /* istanbul ignore next */
  readonly templateParams = signal<Record<string, any>>({});
  /** Validity of the parameter form. */
  /* istanbul ignore next */
  readonly templateFormValid = signal(true);

  // Visuals Config
  /** Widget Title Control. */
  readonly titleControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  /** X-Axis Key Control. */
  readonly xKeyControl = new FormControl<string | null>(null);
  /** Y-Axis Key Control. */
  readonly yKeyControl = new FormControl<string | null>(null);

  /** List of supported visualizations. */
  readonly visualizations = [
    { id: 'table', icon: 'table_chart', label: 'Table' },
    { id: 'metric', icon: 'exposure_plus_1', label: 'Metric Card' },
    { id: 'bar_chart', icon: 'bar_chart', label: 'Bar Chart' },
    { id: 'pie', icon: 'pie_chart', label: 'Pie Chart' },
    { id: 'heatmap', icon: 'grid_on', label: 'Heatmap' },
    { id: 'scalar', icon: 'speed', label: 'Gauge' },
  ];

  /** Whether to show axis config options. */
  /* istanbul ignore next */
  readonly showAxesConfig = computed(() => {
    if (this.draftWidget()?.type === 'TEXT') return false;
    const viz = this.draftWidget()?.visualization;
    return ['bar_chart', 'pie', 'line_graph'].includes(viz || '');
  });

  /** Whether visualization is Pie chart. */
  /* istanbul ignore next */
  readonly isPie = computed(() => this.draftWidget()?.visualization === 'pie');

  /** Available columns from execution result. */
  /* istanbul ignore next */
  readonly availableColumns = computed(() => {
    const id = this.draftWidgetId();
    if (!id) return [];
    const res = this.store.dataMap()[id];
    return (res?.columns || []) as string[];
  });

  /** Whether data config step is valid. */
  /* istanbul ignore next */
  readonly dataConfigured = computed(() => {
    return this.activeMode() === 'template' ? this.templateFormValid() : true;
  });

  /** Final compiled SQL string. */
  readonly finalSql = signal('');
  /** Latest execution result. */
  readonly executionResult = signal<any | null>(null);

  /** Search stream subject. */
  private search$ = new Subject<string>();
  /** RXJS Subscription container. */
  private sub?: Subscription;
  /** Active Tab Index. */
  selectedTab = 0;

  /** Initialize component. */
  ngOnInit(): void {
    this.loadTemplates();
    this.sub = this.search$
      .pipe(debounceTime(300), distinctUntilChanged())
      .subscribe((v) => this.loadTemplates(v));

    // Sync local controls with draft state
    this.titleControl.valueChanges.subscribe((val) => {
      const w = this.draftWidget();
      if (w) this.draftWidget.set({ ...w, title: val });
    });

    this.xKeyControl.valueChanges.subscribe(() => this.syncVizConfig());
    this.yKeyControl.valueChanges.subscribe(() => this.syncVizConfig());
  }

  /** Cleanup on destroy. */
  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    const draft = this.draftWidget();
    // If closed without explicit save/close event, we rely on backend cleanup?
    // In this architecture, drafts persist until explicitly saved or deleted.
    if (draft && !this.dialogRef.getState()) {
      // Optional cleanup logic
    }
  }

  /** Triggers search update. */
  updateSearch(e: Event) {
    this.search$.next((e.target as HTMLInputElement).value);
  }

  /** Toggles category filter. */
  toggleCategory(cat: string) {
    this.selectedCategory.update((c) => (c === cat ? null : cat));
    this.loadTemplates();
  }

  /** Loads templates from API. */
  loadTemplates(search?: string) {
    this.loadingTemplates.set(true);
    this.templatesApi
      .listTemplatesApiV1TemplatesGet(this.selectedCategory() || undefined, search)
      .pipe(finalize(() => this.loadingTemplates.set(false)))
      .subscribe((t) => this.templates.set(t));
  }

  /** Selects a template. */
  selectTemplate(t: TemplateResponse) {
    this.selectedTemplate.set(t);
    this.activeMode.set('template');
    this.selectedCustomType.set(null);
    this.selectionForm.patchValue({ mode: 'predefined', templateId: t.id });
  }

  /** Selects custom type. */
  selectCustomType(type: 'SQL' | 'HTTP' | 'TEXT') {
    this.selectedCustomType.set(type);
    this.activeMode.set('custom');
    this.selectedTemplate.set(null);
    this.selectionForm.patchValue({ mode: 'custom' });
  }

  /** Validates parameters based on mode. */
  parseParams() {
    const mode = this.selectionForm.value.mode;
    if (mode !== 'predefined') {
      this.templateParams.set({});
      this.templateFormValid.set(true);
    }
  }

  /** Compiles template SQL with parameters. */
  renderPreview() {
    const t = this.selectedTemplate();
    if (!t) return;

    let sql = t.sql_template || '';
    const values = this.templateParams();

    Object.keys(values).forEach((key) => {
      let val = values[key];
      sql = sql.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(val));
    });

    this.finalSql.set(sql);
    this.executeDraft(sql);
  }

  /** Executes draft SQL. */
  private executeDraft(sql: string) {
    const draftId = this.draftWidgetId();
    if (!draftId) return;

    this.isBusy.set(true);
    this.dashboardApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(draftId, { config: { query: sql } })
      .subscribe({
        next: () => {
          this.execApi
            .refreshDashboardApiV1DashboardsDashboardIdRefreshPost(this.data.dashboardId, undefined)
            .pipe(finalize(() => this.isBusy.set(false)))
            .subscribe((resMap: any) => {
              this.executionResult.set(resMap[draftId]);
            });
        },
        error: () => this.isBusy.set(false),
      });
  }

  /** Updates parameter state. */
  handleFormChange(values: Record<string, any>) {
    this.templateParams.set(values);
  }
  /** Updates parameter validation status. */
  handleStatusChange(status: 'VALID' | 'INVALID') {
    this.templateFormValid.set(status === 'VALID');
  }

  /** Initializes the draft widget on the server. */
  initializeDraft(stepper?: MatStepper) {
    this.isBusy.set(true);

    // Determine defaults
    let title = 'New Widget';
    let type = this.selectedCustomType() || 'SQL';
    let config: any = {};
    let visualization = 'table';

    if (this.activeMode() === 'template') {
      const t = this.selectedTemplate()!;
      title = t.title;
      type = 'SQL';
      config = { query: t.sql_template };
    } else {
      if (type === 'SQL') {
        config = { query: 'SELECT * FROM hospital_data LIMIT 5' };
      } else if (type === 'HTTP') {
        config = { url: '', method: 'GET' };
        visualization = 'metric';
      } else if (type === 'TEXT') {
        config = { content: '### New Text Widget\nEdit this content.' };
        visualization = 'markdown';
        title = 'Text Block';
      }
    }

    let payload: WidgetIn;
    if (type === 'SQL') {
      payload = { title, type: 'SQL', visualization, config: config as any };
    } else if (type === 'HTTP') {
      payload = { title, type: 'HTTP', visualization, config: config as any };
    } else {
      payload = { title, type: 'TEXT', visualization: 'markdown', config: config as any };
    }

    this.dashboardApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(this.data.dashboardId, payload)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe({
        next: (w) => {
          this.draftWidget.set(w);
          this.titleControl.setValue(w.title);
          stepper?.next();
        },
        error: (e) => console.error('Draft creation failed', e),
      });
  }

  /** Injects parameters into SQL and executes. */
  runTemplateQuery(stepper: MatStepper) {
    const w = this.draftWidget();
    const t = this.selectedTemplate();
    if (!w || !t) return;

    this.isBusy.set(true);

    let sql = t.sql_template;
    const params = this.templateParams();
    Object.keys(params).forEach((key) => {
      sql = sql.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(params[key]));
    });

    const update: WidgetUpdate = { config: { query: sql } };
    this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update).subscribe({
      next: () => {
        this.store.refreshWidget(w.id);
        this.isBusy.set(false);
        stepper.next();
      },
      error: () => this.isBusy.set(false),
    });
  }

  /** Refreshes data before visualization step. */
  validateDataPresence(stepper: MatStepper) {
    const id = this.draftWidgetId();
    if (id) this.store.refreshWidget(id);
    stepper.next();
  }

  /** Handles SQL change in editor. */
  onSqlChange(newSql: string) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, query: newSql } });
  }

  /** Handles Config change in editor. */
  onConfigChange(newConfig: Record<string, any>) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, ...newConfig } });
  }

  /** Handles Content change in editor. */
  onContentChange(content: string) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, content } });
  }

  /** Updates Visualization selection. */
  updateVizType(id: string) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, visualization: id });
  }

  /** Synchronizes visualization config (axes mapping) to draft widget. */
  syncVizConfig() {
    const w = this.draftWidget();
    if (!w) return;

    const currentConfig = { ...w.config };
    currentConfig['xKey'] = this.xKeyControl.value;
    currentConfig['yKey'] = this.yKeyControl.value;

    this.draftWidget.set({ ...w, config: currentConfig });
  }

  /** Saves and closes dialog. */
  saveWidget() {
    this.saveAndClose();
  }

  /** Persists widget to backend and closes. */
  saveAndClose() {
    const w = this.draftWidget();
    if (!w) return;

    this.isBusy.set(true);

    const update: WidgetUpdate = {
      title: this.titleControl.value,
      visualization: w.visualization,
      config: w.config,
    };

    this.dashboardApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe({
        next: () => {
          this.draftWidget.set(null);
          this.dialogRef.close(true);
        },
        error: (e) => console.error(e),
      });
  }

  /** Cancels creation process. */
  cancel() {
    const id = this.draftWidgetId();
    if (id) {
      this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(id).subscribe();
    }
    this.dialogRef.close(false);
  }

  /** Returns highlighted SQL html (Stub). */
  highlightedSql(): string {
    return '';
  }
  /** Syncs scroll position (Stub). */
  syncScroll(e: Event) {}
  /** Casts result to table data. */
  asTableData(res: any) {
    return res || { columns: [], data: [] };
  }
}
