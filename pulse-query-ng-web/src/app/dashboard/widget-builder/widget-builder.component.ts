import { 
  Component, 
  inject, 
  signal, 
  computed, 
  OnInit, 
  OnDestroy, 
  ChangeDetectionStrategy 
} from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { FormsModule, ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms'; 
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
  WidgetCreate, 
  WidgetUpdate, 
  WidgetResponse
} from '../../api-client'; 
import { DashboardStore } from '../dashboard.store'; 

// Components
import { DynamicFormComponent } from '../template-wizard/dynamic-form.component'; 
import { SqlBuilderComponent } from '../../editors/sql-builder.component'; 
import { HttpConfigComponent } from '../../editors/http-config.component'; 
import { WidgetComponent } from '../../widget/widget.component'; 
import { TextEditorComponent } from '../../editors/text-editor.component'; 

export interface WidgetBuilderData { 
  dashboardId: string; 
} 

@Component({ 
  selector: 'app-widget-builder', 
  standalone: true, 
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
    TextEditorComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  templateUrl: './widget-builder.component.html', 
  styles: [`
    :host { display: block; height: 85vh; width: 100vw; max-width: 1200px; } 
    
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
    .viz-option:hover { background-color: var(--sys-hover); } 
    .viz-option.selected { 
      background-color: var(--sys-selected); 
      color: var(--sys-primary); 
      border-color: var(--sys-primary); 
    } 
  `] 
}) 
export class WidgetBuilderComponent implements OnInit, OnDestroy { 
  private readonly fb = inject(FormBuilder); 
  readonly data = inject<WidgetBuilderData>(MAT_DIALOG_DATA); 
  private readonly dialogRef = inject(MatDialogRef<WidgetBuilderComponent>); 
  private readonly dashboardApi = inject(DashboardsService); 
  private readonly templatesApi = inject(TemplatesService); 
  private readonly execApi = inject(ExecutionService); 
  
  // Pivot to DashboardStore for data checking
  readonly store = inject(DashboardStore); 

  // --- STATE SIGNALS --- 
  readonly activeMode = signal<'template' | 'custom' | null>(null); 
  readonly selectedTemplate = signal<TemplateResponse | null>(null); 
  readonly selectedCustomType = signal<'SQL' | 'HTTP' | 'TEXT' | null>(null); 
  readonly draftWidget = signal<WidgetResponse | null>(null); // The widget being built
  
  readonly templates = signal<TemplateResponse[]>([]); 
  readonly loadingTemplates = signal(false); 
  readonly isBusy = signal(false); 
  readonly categories = signal<string[]>(['Operational', 'Clinical', 'Capacity', 'Financial', 'Flow']); 
  readonly selectedCategory = signal<string | null>(null); 

  // Derived Helpers
  readonly selectedTemplateId = computed(() => this.selectedTemplate()?.id); 
  readonly draftWidgetId = computed(() => this.draftWidget()?.id); 
  readonly paramsSchema = computed(() => this.selectedTemplate()?.parameters_schema || {}); 
  
  // Form Steps
  readonly sourceForm = this.fb.group({}); // Dummy for Step 1 validatior
  
  readonly templateParams = signal<Record<string, any>>({}); 
  readonly templateFormValid = signal(true); 

  // Visuals Config
  readonly titleControl = new FormControl('', { nonNullable: true, validators: [Validators.required] }); 
  readonly xKeyControl = new FormControl<string | null>(null); 
  readonly yKeyControl = new FormControl<string | null>(null); 

  readonly visualizations = [ 
    { id: 'table', icon: 'table_chart', label: 'Table' }, 
    { id: 'metric', icon: 'exposure_plus_1', label: 'Metric Card' }, 
    { id: 'bar_chart', icon: 'bar_chart', label: 'Bar Chart' }, 
    { id: 'pie', icon: 'pie_chart', label: 'Pie Chart' }, 
    { id: 'heatmap', icon: 'grid_on', label: 'Heatmap' }, 
    { id: 'scalar', icon: 'speed', label: 'Gauge' } 
  ]; 

  readonly showAxesConfig = computed(() => { 
    // TEXT type skips visualization step logic usually, or hides this part
    if (this.draftWidget()?.type === 'TEXT') return false; 
    const viz = this.draftWidget()?.visualization; 
    return ['bar_chart', 'pie', 'line_graph'].includes(viz || ''); 
  }); 
  
  readonly isPie = computed(() => this.draftWidget()?.visualization === 'pie'); 

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
  private search$ = new Subject<string>(); 
  private sub?: Subscription; 
  selectedTab = 0; // 0=Templates, 1=Custom

  ngOnInit(): void { 
    this.loadTemplates(); 
    this.sub = this.search$.pipe(debounceTime(300), distinctUntilChanged()) 
      .subscribe(v => this.loadTemplates(v)); 
    
    // Sync local controls with draft state
    this.titleControl.valueChanges.subscribe(val => { 
      const w = this.draftWidget(); 
      if (w) this.draftWidget.set({ ...w, title: val }); 
    }); 
    
    this.xKeyControl.valueChanges.subscribe(() => this.syncVizConfig()); 
    this.yKeyControl.valueChanges.subscribe(() => this.syncVizConfig()); 
  } 

  ngOnDestroy(): void { 
    this.sub?.unsubscribe(); 
    // Cleanup draft if not saved (Dialog closed via other means checks this too) 
    // Here we mainly ensure subscriptions dead
  } 

  // --- Actions --- 

  updateSearch(e: Event) { this.search$.next((e.target as HTMLInputElement).value); } 
  
  toggleCategory(cat: string) { 
    this.selectedCategory.update(c => c === cat ? null : cat); 
    this.loadTemplates(); 
  } 

  loadTemplates(search?: string) { 
    this.loadingTemplates.set(true); 
    this.templatesApi.listTemplatesApiV1TemplatesGet( 
      this.selectedCategory() || undefined, 
      search
    ).pipe(finalize(() => this.loadingTemplates.set(false))) 
    .subscribe(t => this.templates.set(t)); 
  } 

  selectTemplate(t: TemplateResponse) { 
    this.selectedTemplate.set(t); 
    this.activeMode.set('template'); 
    this.selectedCustomType.set(null); 
  } 

  selectCustomType(type: 'SQL' | 'HTTP' | 'TEXT') { 
    this.selectedCustomType.set(type); 
    this.activeMode.set('custom'); 
    this.selectedTemplate.set(null); 
  } 

  /** 
   * Transition to Configure Step. 
   * Creates the backend widget placeholder. 
   */ 
  initializeDraft() { 
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

    const payload: WidgetCreate = { 
      title, 
      type, 
      visualization, 
      config
    }; 

    this.dashboardApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(this.data.dashboardId, payload) 
      .pipe(finalize(() => this.isBusy.set(false))) 
      .subscribe({ 
        next: (w) => { 
          this.draftWidget.set(w); 
          this.titleControl.setValue(w.title); // Init visual title
        }, 
        error: (e) => console.error('Draft creation failed', e) 
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
    Object.keys(params).forEach(key => { 
      sql = sql.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(params[key])); 
    }); 

    // 2. Update Widget Config
    const update: WidgetUpdate = { config: { query: sql } }; 
    this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update) 
      .subscribe({ 
        next: () => { 
          // 3. Trigger Refresh to get data
          this.store.refreshWidget(w.id); 
          this.isBusy.set(false); 
          stepper.next(); 
        }, 
        error: () => this.isBusy.set(false) 
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

  // --- Step 3: Visualize --- 

  updateVizType(id: string) { 
    const w = this.draftWidget(); 
    if (w) this.draftWidget.set({ ...w, visualization: id }); 
    // Don't save to backend yet? Or should we? 
    // Live preview in 'app-widget' relies on input. 
    // 'app-widget' uses 'widgetInput()'. Updated signal propagates. 
    // BUT 'app-widget' logic for mapping might need correct config. 
  } 

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

  saveAndClose() { 
    const w = this.draftWidget(); 
    if (!w) return; 

    this.isBusy.set(true); 
    
    // Commit Visual Changes (Title, Viz Type, Axis Mappings) 
    const update: WidgetUpdate = { 
      title: this.titleControl.value, 
      visualization: w.visualization, 
      config: w.config 
    }; 

    this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update) 
      .pipe(finalize(() => this.isBusy.set(false))) 
      .subscribe(() => { 
        this.draftWidget.set(null); // Clear signal so onDestroy doesn't delete it
        this.dialogRef.close(true); 
      }); 
  } 

  cancel() { 
    const id = this.draftWidgetId(); 
    if (id) { 
      this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(id).subscribe(); 
    } 
    this.dialogRef.close(false); 
  } 
}