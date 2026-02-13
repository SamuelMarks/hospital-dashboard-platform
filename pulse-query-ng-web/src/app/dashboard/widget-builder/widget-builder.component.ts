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

// Material
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

// Core
import {
  DashboardsService,
  ExecutionService,
  TemplatesService,
  TemplateResponse,
  WidgetIn,
  WidgetCreateSql, // Import
  WidgetCreateHttp, // Import
  WidgetCreateText, // Import
  WidgetUpdate,
  WidgetResponse,
} from '../../api-client';
import { DashboardStore } from '../dashboard.store';

// Components
import { DynamicFormComponent } from '../template-wizard/dynamic-form.component';
import { SqlBuilderComponent } from '../../editors/sql-builder.component';
import { HttpConfigComponent } from '../../editors/http-config.component';
import { WidgetComponent } from '../../widget/widget.component';
import { TextEditorComponent } from '../../editors/text-editor.component';

/** Widget Builder Data interface. */
export interface WidgetBuilderData {
  /** dashboardId property. */
  dashboardId: string;
}

/** Widget Builder component. */
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
    DynamicFormComponent,
    SqlBuilderComponent,
    HttpConfigComponent,
    WidgetComponent,
    TextEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './widget-builder.component.html',
  styles: [
    `
      :host {
        display: block;
        height: 85vh;
        width: 100vw;
        max-width: 1200px;
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

      /* Custom Option Cards */
      .source-option {
        border: 1px solid var(--sys-surface-border);
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        background-color: white;
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

      /* Viz Selector */
      .viz-option {
        border: 1px solid var(--sys-surface-border);
        border-radius: 4px;
        padding: 8px;
        text-align: center;
        cursor: pointer;
        color: var(--sys-text-secondary);
      }
      .viz-option:hover {
        background-color: var(--sys-hover);
      }
      .viz-option.selected {
        background-color: var(--sys-selected);
        color: var(--sys-primary);
        border-color: var(--sys-primary);
      }
    `,
  ],
})
export class WidgetBuilderComponent implements OnInit, OnDestroy {
  /** fb property. */
  private readonly fb = inject(FormBuilder);
  /** Data. */
  readonly data = inject<WidgetBuilderData>(MAT_DIALOG_DATA);
  /** dialogRef property. */
  private readonly dialogRef = inject(MatDialogRef<WidgetBuilderComponent>);
  /** dashboardApi property. */
  private readonly dashboardApi = inject(DashboardsService);
  /** templatesApi property. */
  private readonly templatesApi = inject(TemplatesService);
  /** execApi property. */
  private readonly execApi = inject(ExecutionService);

  // Pivot to DashboardStore for data checking
  /** Store. */
  readonly store = inject(DashboardStore);

  // --- STATE SIGNALS ---
  /** Active Mode. */
  readonly activeMode = signal<'template' | 'custom' | null>(null);
  /** Selected Template. */
  readonly selectedTemplate = signal<TemplateResponse | null>(null);
  /** Selected Custom Type. */
  readonly selectedCustomType = signal<'SQL' | 'HTTP' | 'TEXT' | null>(null);
  /** Draft Widget. */
  readonly draftWidget = signal<WidgetResponse | null>(null); // The widget being built

  /** Templates. */
  readonly templates = signal<TemplateResponse[]>([]);
  /** Loading Templates. */
  readonly loadingTemplates = signal(false);
  /** Whether busy. */
  readonly isBusy = signal(false);
  /** Categories. */
  readonly categories = signal<string[]>([
    'Operational',
    'Clinical',
    'Capacity',
    'Financial',
    'Flow',
  ]);
  /** Selected Category. */
  readonly selectedCategory = signal<string | null>(null);

  // Derived Helpers
  /** Selected Template Id. */
  readonly selectedTemplateId = computed(() => this.selectedTemplate()?.id);
  /** Draft Widget Id. */
  readonly draftWidgetId = computed(() => this.draftWidget()?.id);
  /** Params Schema. */
  readonly paramsSchema = computed(() => this.selectedTemplate()?.parameters_schema || {});

  // Form Steps
  /** Source Form. */
  readonly sourceForm = this.fb.group({}); // Dummy for Step 1 validatior

  /** Template Params. */
  readonly templateParams = signal<Record<string, any>>({});
  /** Template Form Valid. */
  readonly templateFormValid = signal(true);

  // Visuals Config
  /** Title Control. */
  readonly titleControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  /** X Key Control. */
  readonly xKeyControl = new FormControl<string | null>(null);
  /** Y Key Control. */
  readonly yKeyControl = new FormControl<string | null>(null);

  /** Visualizations. */
  readonly visualizations = [
    { id: 'table', icon: 'table_chart', label: 'Table' },
    { id: 'metric', icon: 'exposure_plus_1', label: 'Metric Card' },
    { id: 'bar_chart', icon: 'bar_chart', label: 'Bar Chart' },
    { id: 'pie', icon: 'pie_chart', label: 'Pie Chart' },
    { id: 'heatmap', icon: 'grid_on', label: 'Heatmap' },
    { id: 'scalar', icon: 'speed', label: 'Gauge' },
  ];

  /** Show Axes Config. */
  readonly showAxesConfig = computed(() => {
    // TEXT type skips visualization step logic usually, or hides this part
    if (this.draftWidget()?.type === 'TEXT') return false;
    const viz = this.draftWidget()?.visualization;
    return ['bar_chart', 'pie', 'line_graph'].includes(viz || '');
  });

  /** Whether pie. */
  readonly isPie = computed(() => this.draftWidget()?.visualization === 'pie');

  /** Available Columns. */
  readonly availableColumns = computed(() => {
    const id = this.draftWidgetId();
    if (!id) return [];
    const res = this.store.dataMap()[id];
    return (res?.columns || []) as string[];
  });

  /**
   * Computed flag to control Step 2 completion status.
   * - Templates: Requires active form validation.
   * - Custom: Assumed valid if step reachable (validation internal to child component).
   */
  readonly dataConfigured = computed(() => {
    return this.activeMode() === 'template' ? this.templateFormValid() : true;
  });

  // Search Logic
  /** search$ property. */
  private search$ = new Subject<string>();
  /** sub property. */
  private sub?: Subscription;
  /** Selected Tab. */
  selectedTab = 0; // 0=Templates, 1=Custom

  /** Ng On Init. */
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

  /** Ng On Destroy. */
  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    // Cleanup draft if not saved (Dialog closed via other means checks this too)
    // Here we mainly ensure subscriptions dead
  }

  // --- Actions ---

  /** Updates search. */
  updateSearch(e: Event) {
    this.search$.next((e.target as HTMLInputElement).value);
  }

  /** Toggles category. */
  toggleCategory(cat: string) {
    this.selectedCategory.update((c) => (c === cat ? null : cat));
    this.loadTemplates();
  }

  /** Loads templates. */
  loadTemplates(search?: string) {
    this.loadingTemplates.set(true);
    this.templatesApi
      .listTemplatesApiV1TemplatesGet(this.selectedCategory() || undefined, search)
      .pipe(finalize(() => this.loadingTemplates.set(false)))
      .subscribe((t) => this.templates.set(t));
  }

  /** Select Template. */
  selectTemplate(t: TemplateResponse) {
    this.selectedTemplate.set(t);
    this.activeMode.set('template');
    this.selectedCustomType.set(null);
  }

  /** Select Custom Type. */
  selectCustomType(type: 'SQL' | 'HTTP' | 'TEXT') {
    this.selectedCustomType.set(type);
    this.activeMode.set('custom');
    this.selectedTemplate.set(null);
  }

  /**
   * Transition to Configure Step.
   * Creates the backend widget placeholder AND advances the stepper.
   *
   * @param stepper - Optional reference to MatStepper to trigger transition.
   */
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
      config = { query: t.sql_template }; // Raw with handlebars
    } else {
      if (type === 'SQL') {
        config = { query: 'SELECT * FROM hospital_data LIMIT 5' };
      } else if (type === 'HTTP') {
        config = { url: '', method: 'GET' };
        visualization = 'metric';
      } else if (type === 'TEXT') {
        config = { content: '### New Text Widget\nEdit this content.' };
        visualization = 'markdown'; // Explicit viz type for text
        title = 'Text Block';
      }
    }

    // Fix: Explicitly cast payload based on discriminator
    let payload: WidgetIn;

    if (type === 'SQL') {
      payload = { title, type: 'SQL', visualization, config: config as any };
    } else if (type === 'HTTP') {
      payload = { title, type: 'HTTP', visualization, config: config as any };
    } else {
      // Enforce literal type for visualization to satisfy union
      payload = { title, type: 'TEXT', visualization: 'markdown', config: config as any };
    }

    this.dashboardApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(this.data.dashboardId, payload)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe({
        next: (w) => {
          this.draftWidget.set(w);
          this.titleControl.setValue(w.title); // Init visual title

          // FIX: Trigger stepper transition now that data is ready
          stepper?.next();
        },
        error: (e) => console.error('Draft creation failed', e),
      });
  }

  /**
   * Step 2 Action: Process Template Params
   */
  runTemplateQuery(stepper: MatStepper) {
    const w = this.draftWidget();
    const t = this.selectedTemplate();
    if (!w || !t) return;

    this.isBusy.set(true);

    // 1. Inject Params
    let sql = t.sql_template;
    const params = this.templateParams();
    Object.keys(params).forEach((key) => {
      sql = sql.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(params[key]));
    });

    // 2. Update Widget Config
    const update: WidgetUpdate = { config: { query: sql } };
    this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update).subscribe({
      next: () => {
        // 3. Trigger Refresh to get data
        this.store.refreshWidget(w.id);
        this.isBusy.set(false);
        stepper.next();
      },
      error: () => this.isBusy.set(false),
    });
  }

  /**
   * Step 2 Action: Custom Flows
   * Allows moving to visualize if we assume user has configured/run in the child component.
   */
  validateDataPresence(stepper: MatStepper) {
    // We assume the user hit "Run" in the child component.
    // We can also trigger a refresh here just in case.
    const id = this.draftWidgetId();
    if (id) this.store.refreshWidget(id);
    stepper.next();
  }

  // --- Synchronization Handlers (CRITICAL FIX) ---
  // Keeps parent `draftWidget` state in sync with changes occurring in child components (SQL/HTTP/Text Editors).
  // Without this, `saveAndClose()` overwrites backend updates with stale initial config.

  /** Handles sql Change. */
  onSqlChange(newSql: string) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, query: newSql } });
  }

  /** Handles config Change. */
  onConfigChange(newConfig: Record<string, any>) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, ...newConfig } });
  }

  /** Handles content Change. */
  onContentChange(content: string) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, config: { ...w.config, content } });
  }

  // --- Step 3: Visualize ---

  /** Updates viz Type. */
  updateVizType(id: string) {
    const w = this.draftWidget();
    if (w) this.draftWidget.set({ ...w, visualization: id });
    // Don't save to backend yet? Or should we?
    // Live preview in 'app-widget' relies on input.
    // 'app-widget' uses 'widgetInput()'. Updated signal propagates.
    // BUT 'app-widget' logic for mapping might need correct config.
  }

  /** Sync Viz Config. */
  syncVizConfig() {
    const w = this.draftWidget();
    if (!w) return;

    // To see changes live in Chart, we must update the 'config' object in the draft structure
    const currentConfig = { ...w.config };
    currentConfig['xKey'] = this.xKeyControl.value;
    currentConfig['yKey'] = this.yKeyControl.value;

    this.draftWidget.set({ ...w, config: currentConfig });
  }

  // --- Finalize ---

  /** Save And Close. */
  saveAndClose() {
    const w = this.draftWidget();
    if (!w) return;

    this.isBusy.set(true);

    // Commit Visual Changes (Title, Viz Type, Axis Mappings)
    const update: WidgetUpdate = {
      title: this.titleControl.value,
      visualization: w.visualization,
      config: w.config,
    };

    this.dashboardApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update)
      .pipe(finalize(() => this.isBusy.set(false)))
      .subscribe(() => {
        this.draftWidget.set(null); // Clear signal so onDestroy doesn't delete it
        this.dialogRef.close(true);
      });
  }

  /** Whether cel. */
  cancel() {
    const id = this.draftWidgetId();
    if (id) {
      this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(id).subscribe();
    }
    this.dialogRef.close(false);
  }
}
