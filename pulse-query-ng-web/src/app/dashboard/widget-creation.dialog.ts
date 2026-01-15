import { Component, ChangeDetectionStrategy, inject, signal, OnDestroy, computed, Signal } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { 
  ReactiveFormsModule, 
  FormsModule, 
  FormBuilder, 
  Validators, 
  FormGroup 
} from '@angular/forms'; 

// Material Imports
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatRadioModule } from '@angular/material/radio'; 
import { MatStepperModule } from '@angular/material/stepper'; 
import { MatFormFieldModule } from '@angular/material/form-field'; 
import { MatInputModule } from '@angular/material/input'; 
import { MatSelectModule } from '@angular/material/select'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 

// App Imports
import { DashboardsService, WidgetCreate, WidgetUpdate, WidgetResponse, DashboardResponse } from '../api-client'; 
import { DashboardStore } from './dashboard.store'; 
import { SqlBuilderComponent } from '../editors/sql-builder.component'; 
import { HttpConfigComponent } from '../editors/http-config.component'; 

export interface WidgetCreationData { 
  dashboardId: string; 
} 

/** 
 * Widget Creation Wizard Dialog. 
 * 
 * Orchestrates the multi-step process of creating a new widget. 
 * 
 * **Dark Mode Fixes:** 
 * - Styles now strictly use CSS variables (`--sys-*`) defined in `styles.scss` 
 *   instead of hardcoded hex codes. 
 * - Option Cards explicitly handle hover/selected states using transparency 
 *   to work on both Light (White) and Dark (Gray/Black) backgrounds. 
 */ 
@Component({ 
  selector: 'app-widget-creation-dialog', 
  standalone: true, 
  imports: [ 
    CommonModule, 
    ReactiveFormsModule, 
    FormsModule, 
    MatDialogModule, 
    MatButtonModule, 
    MatIconModule, 
    MatRadioModule, 
    MatStepperModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatSelectModule, 
    MatProgressSpinnerModule, 
    SqlBuilderComponent, 
    HttpConfigComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    /* Host resets */ 
    :host { 
      display: block; 
      width: 100%; 
    } 

    /* Remove default material padding/height constraints */ 
    mat-dialog-content { 
      padding: 0 !important; 
      margin: 0 !important; 
      max-height: 90vh; 
      display: block; 
    } 

    /* Steps 1 & 2: Shrink-wrap layout */ 
    .compact-step-wrapper { 
      padding: 24px; 
    } 

    /* Spacing control: Exactly 7px top margin for actions */ 
    .step-actions { 
      display: flex; 
      justify-content: space-between; 
      margin-top: 7px; 
    } 
    .step-actions.end { 
      justify-content: flex-end; 
    } 

    /* Config Step Layout */ 
    .config-layout { 
      display: flex; 
      flex-direction: column; 
      height: 70vh; 
      overflow: hidden; 
    } 

    .config-header { 
      padding: 16px 24px; 
      /* Fix: Use semantic surface color (Dark in Dark Mode) */ 
      background-color: var(--sys-background); 
      border-bottom: 1px solid var(--sys-surface-border); 
      display: grid; 
      grid-template-columns: 1fr 1fr 1fr; 
      gap: 16px; 
      flex-shrink: 0; 
    } 

    .editor-container { 
      flex: 1; 
      min-height: 0; 
      display: flex; 
      flex-direction: column; 
      position: relative; 
      background-color: var(--sys-surface); 
    } 

    .actions-footer { 
      padding: 12px 16px; 
      border-top: 1px solid var(--sys-surface-border); 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      /* Fix: Ensure footer background matches theme */ 
      background-color: var(--sys-surface); 
      flex-shrink: 0; 
      z-index: 10; 
    } 

    /* -- Option Cards (Data Source) -- */ 
    .option-card { 
      border: 1px solid var(--sys-surface-border); 
      border-radius: 8px; 
      padding: 16px; 
      margin-bottom: 8px; 
      cursor: pointer; 
      transition: all 0.2s; 
      display: flex; 
      align-items: center; 
      gap: 16px; 
      background-color: var(--sys-surface); 
      color: var(--sys-text-primary); 
    } 
    /* Hover: Use system hover opacity */ 
    .option-card:hover { 
      background-color: var(--sys-hover); 
    } 
    /* Selected: Use system selected tint and primary border */ 
    .option-card.selected { 
      border-color: var(--sys-primary); 
      background-color: var(--sys-selected); 
    } 

    /* -- Viz Grid (Step 2) -- */ 
    .viz-grid { 
      display: grid; 
      grid-template-columns: repeat(2, 1fr); 
      gap: 12px; 
    } 
    .viz-item { 
      border: 1px solid var(--sys-surface-border); 
      border-radius: 8px; 
      padding: 16px; 
      text-align: center; 
      cursor: pointer; 
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      gap: 8px; 
      background-color: var(--sys-surface); 
      color: var(--sys-text-primary); 
      transition: all 0.2s; 
    } 
    .viz-item:hover { 
      background-color: var(--sys-hover); 
    } 
    .viz-item.selected { 
      border-color: var(--sys-primary); 
      background-color: var(--sys-selected); 
      color: var(--sys-primary); 
    } 

    /* Helpers */ 
    .text-sm { font-size: 0.875rem; line-height: 1.25rem; } 
    .font-medium { font-weight: 500; } 
    .text-xs { font-size: 0.75rem; line-height: 1rem; } 
    .text-gray-500 { color: var(--sys-text-secondary); } 
    .mb-4 { margin-bottom: 1rem; } 
    .flex-grow { flex-grow: 1; } 

    @media (max-width: 600px) { 
      .config-header { grid-template-columns: 1fr; } 
    } 
  `], 
  template: `
    <h2 mat-dialog-title>Add New Widget</h2>
    
    <mat-dialog-content>
      <mat-stepper [linear]="true" #stepper class="w-full">
        
        <!-- STEP 1: Data Source -->
        <mat-step [completed]="!!selectedType()">
          <ng-template matStepLabel>Source</ng-template>
          
          <div class="compact-step-wrapper">
            <p class="text-sm text-gray-500 mb-4">Where will this widget get its data from?</p>

            <div class="option-card" [class.selected]="selectedType() === 'SQL'" (click)="setType('SQL')" data-testid="option-sql">
              <mat-icon class="text-primary" style="color: var(--sys-primary)">storage</mat-icon>
              <div>
                <div class="font-medium">SQL Database</div>
                <div class="text-xs text-gray-500">Query the internal DuckDB analytics engine.</div>
              </div>
              <div class="flex-grow"></div>
              <mat-radio-button [checked]="selectedType() === 'SQL'" [disabled]="true"></mat-radio-button>
            </div>

            <div class="option-card" [class.selected]="selectedType() === 'HTTP'" (click)="setType('HTTP')" data-testid="option-http">
              <mat-icon class="text-accent" style="color: var(--sys-accent)">cloud_download</mat-icon>
              <div>
                <div class="font-medium">HTTP Request</div>
                <div class="text-xs text-gray-500">Fetch JSON data from an external REST API.</div>
              </div>
              <div class="flex-grow"></div>
              <mat-radio-button [checked]="selectedType() === 'HTTP'" [disabled]="true"></mat-radio-button>
            </div>

            <div class="step-actions end">
              <button mat-flat-button color="primary" matStepperNext [disabled]="!selectedType()" data-testid="btn-next-step1">
                Next
              </button>
            </div>
          </div>
        </mat-step>

        <!-- STEP 2: Visualization -->
        <mat-step [completed]="!!selectedViz()">
          <ng-template matStepLabel>Visualization</ng-template>
          
          <div class="compact-step-wrapper">
            <p class="text-sm text-gray-500 mb-4">How should the result be displayed?</p>

            <div class="viz-grid">
              <div class="viz-item" [class.selected]="selectedViz() === 'table'" (click)="selectedViz.set('table')" data-testid="viz-table">
                <mat-icon>table_chart</mat-icon>
                <span class="text-sm font-medium">Data Table</span>
              </div>
              <div class="viz-item" [class.selected]="selectedViz() === 'bar_chart'" (click)="selectedViz.set('bar_chart')" data-testid="viz-chart">
                <mat-icon>bar_chart</mat-icon>
                <span class="text-sm font-medium">Bar Chart</span>
              </div>
              <div class="viz-item" [class.selected]="selectedViz() === 'metric'" (click)="selectedViz.set('metric')" data-testid="viz-metric">
                <mat-icon>exposure_plus_1</mat-icon>
                <span class="text-sm font-medium">Scorecard</span>
              </div>
              <div class="viz-item" [class.selected]="selectedViz() === 'pie'" (click)="selectedViz.set('pie')" data-testid="viz-pie">
                <mat-icon>pie_chart</mat-icon>
                <span class="text-sm font-medium">Pie Chart</span>
              </div>
            </div>

            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-flat-button color="primary" matStepperNext (click)="createDraftWidget()" [disabled]="!selectedViz()" data-testid="btn-next-step2">
                Next: Configure
              </button>
            </div>
          </div>
        </mat-step>

        <!-- STEP 3: Configure -->
        <mat-step>
          <ng-template matStepLabel>Configure</ng-template>
          
          <div class="config-layout">
            @if (isCreatingDraft()) { 
               <div class="flex-grow flex flex-col items-center justify-center p-8">
                  <mat-spinner diameter="40" class="mb-4"></mat-spinner>
                  <span class="text-gray-500">Initializing Draft Widget...</span>
               </div>
            } @else if (draftWidget(); as widget) { 
                <!-- Header -->
                <div class="config-header" [formGroup]="configForm">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Widget Title</mat-label>
                    <input matInput formControlName="title" placeholder="My Analysis">
                  </mat-form-field>

                  @if (supportsMapping()) { 
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ isPie() ? 'Label Column' : 'X-Axis / Category' }}</mat-label>
                      <mat-select formControlName="xKey">
                        <mat-option [value]="null">-- Auto --</mat-option>
                        @for (col of availableColumns(); track col) { <mat-option [value]="col">{{ col }}</mat-option> } 
                      </mat-select>
                    </mat-form-field>

                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ isPie() ? 'Size Column' : 'Y-Axis / Value' }}</mat-label>
                      <mat-select formControlName="yKey">
                        <mat-option [value]="null">-- Auto --</mat-option>
                        @for (col of availableColumns(); track col) { <mat-option [value]="col">{{ col }}</mat-option> } 
                      </mat-select>
                    </mat-form-field>
                  } 
                </div>

                <!-- Editor -->
                <div class="editor-container">
                  @if (selectedType() === 'SQL') { 
                    <app-sql-builder 
                      [dashboardId]="data.dashboardId" 
                      [widgetId]="widget.id" 
                      [initialSql]="widget.config['query']" 
                      class="h-full w-full block" 
                    ></app-sql-builder>
                  } 
                  @else { 
                    <app-http-config 
                      [dashboardId]="data.dashboardId" 
                      [widgetId]="widget.id" 
                      [initialConfig]="widget.config" 
                      class="h-full w-full block" 
                    ></app-http-config>
                  } 
                </div>

                <!-- Footer (Pinned) -->
                <div class="actions-footer">
                  <button mat-button color="warn" (click)="cancel()">Cancel</button>
                  <button mat-flat-button color="primary" (click)="finalizeWidget()" [disabled]="configForm.invalid" data-testid="btn-finish">
                    Create Widget
                  </button>
                </div>
            } 
          </div>
        </mat-step>

      </mat-stepper>
    </mat-dialog-content>
  `
}) 
export class WidgetCreationDialog implements OnDestroy { 
  private readonly dialogRef = inject(MatDialogRef<WidgetCreationDialog>); 
  private readonly dashboardsApi = inject(DashboardsService); 
  private readonly store = inject(DashboardStore); 
  private readonly fb = inject(FormBuilder); 

  readonly data = inject<WidgetCreationData>(MAT_DIALOG_DATA); 

  readonly selectedType = signal<'SQL' | 'HTTP' | null>(null); 
  readonly selectedViz = signal<string | null>(null); 
  readonly isCreatingDraft = signal(false); 
  readonly draftWidget = signal<WidgetResponse | null>(null); 

  readonly configForm: FormGroup = this.fb.group({ 
    title: ['', Validators.required], 
    xKey: [null], 
    yKey: [null] 
  }); 

  readonly supportsMapping = computed(() => { 
    return ['bar_chart', 'line_graph', 'pie'].includes(this.selectedViz() || ''); 
  }); 
  readonly isPie = computed(() => this.selectedViz() === 'pie'); 

  readonly availableColumns: Signal<string[]> = computed(() => { 
    const widget = this.draftWidget(); 
    if (!widget) return []; 
    const result = this.store.dataMap()[widget.id]; 
    if (result && Array.isArray(result.columns)) return result.columns as string[]; 
    return []; 
  }); 

  ngOnDestroy(): void { 
    const draft = this.draftWidget(); 
    if (draft) { 
      this.dashboardsApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(draft.id) 
        .subscribe({ error: (e) => console.warn('Draft cleanup failed', e) }); 
    } 
  } 

  setType(type: 'SQL' | 'HTTP'): void { 
    this.selectedType.set(type); 
  } 

  createDraftWidget(): void { 
    if (this.draftWidget() || this.isCreatingDraft()) return; 
    
    this.isCreatingDraft.set(true); 
    const viz = this.selectedViz()!; 
    const type = this.selectedType()!; 
    
    const initialConfig = type === 'SQL' 
      ? { query: 'SELECT * FROM hospital_visits LIMIT 5' } 
      : { url: 'https://jsonplaceholder.typicode.com/todos/1', method: 'GET' }; 

    const payload: WidgetCreate = { 
      title: 'New Widget (Draft)', 
      type: type, 
      visualization: viz, 
      config: initialConfig
    }; 

    this.dashboardsApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(this.data.dashboardId, payload) 
      .subscribe({ 
        next: (widget) => { 
          this.draftWidget.set(widget); 
          this.isCreatingDraft.set(false); 
          this.configForm.patchValue({ title: `New ${this.formatTitle(viz)}` }); 
          this.store.refreshWidget(widget.id); 
        }, 
        error: (err) => { 
          console.error(err); 
          alert('Failed to initialize editor'); 
          this.dialogRef.close(false); 
        } 
      }); 
  } 

  finalizeWidget(): void { 
    const draft = this.draftWidget(); 
    if (!draft || this.configForm.invalid) return; 

    this.dashboardsApi.getDashboardApiV1DashboardsDashboardIdGet(this.data.dashboardId).subscribe((dash: DashboardResponse) => { 
       const fresh = dash.widgets?.find((w: WidgetResponse) => w.id === draft.id); 
       if (!fresh) return; 

       const updatedConfig = { ...fresh.config }; 
       if (this.supportsMapping()) { 
         updatedConfig['xKey'] = this.configForm.value.xKey; 
         updatedConfig['yKey'] = this.configForm.value.yKey; 
       } 

       const update: WidgetUpdate = { 
         title: this.configForm.value.title!, 
         config: updatedConfig
       }; 

       this.dashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(draft.id, update).subscribe(() => { 
         this.draftWidget.set(null); 
         this.dialogRef.close(true); 
       }); 
    }); 
  } 

  cancel(): void { 
    this.dialogRef.close(false); 
  } 

  private formatTitle(viz: string): string { 
    return viz.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); 
  } 
}