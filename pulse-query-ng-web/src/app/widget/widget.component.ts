/**
 * @fileoverview Generic Wrapper Component for Dashboard Widgets.
 * 
 * Includes:
 * - **Safe Mode** Reset Logic.
 * - Error Rendering.
 * - Pass-through of configuration for alerts/thresholds.
 */

import { 
  Component, 
  input, 
  output, 
  inject, 
  computed, 
  ChangeDetectionStrategy
} from '@angular/core'; 
import { CommonModule } from '@angular/common'; 

// Material Imports
import { MatCardModule } from '@angular/material/card'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatChipsModule } from '@angular/material/chips'; 
import { MatTooltipModule } from '@angular/material/tooltip'; 

import { DashboardStore } from '../dashboard/dashboard.store'; 
import { WidgetResponse, DashboardsService, WidgetUpdate } from '../api-client'; 
import { SkeletonLoaderComponent, SkeletonVariant } from '../shared/components/skeleton-loader.component'; 
import { ErrorBoundaryDirective } from '../core/error/error-boundary.directive'; 

// Visualizations 
import { VizTableComponent, TableDataSet } from '../shared/visualizations/viz-table/viz-table.component'; 
import { VizMetricComponent } from '../shared/visualizations/viz-metric/viz-metric.component'; 
import { VizChartComponent, ChartConfig } from '../shared/visualizations/viz-chart/viz-chart.component'; 
import { VizPieComponent } from '../shared/visualizations/viz-pie/viz-pie.component'; 
import { VizHeatmapComponent } from '../shared/visualizations/viz-heatmap/viz-heatmap.component'; 
import { VizScalarComponent } from '../shared/visualizations/viz-scalar/viz-scalar.component'; 
import { VizMarkdownComponent } from '../shared/visualizations/viz-markdown/viz-markdown.component'; 

@Component({ 
  selector: 'app-widget', 
  imports: [ 
    CommonModule, 
    MatCardModule, 
    MatIconModule, 
    MatButtonModule, 
    MatChipsModule, 
    MatTooltipModule, 
    SkeletonLoaderComponent, 
    ErrorBoundaryDirective, 
    VizTableComponent, 
    VizMetricComponent, 
    VizChartComponent, 
    VizPieComponent, 
    VizHeatmapComponent, 
    VizScalarComponent, 
    VizMarkdownComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  host: { 
    'tabindex': '0', 
    'class': 'widget-host', 
    '(keydown.escape)': 'onEscape($event)', 
    '(focus)': 'onFocus()' 
  }, 
  styles: [`
    :host { display: block; height: 100%; outline: none; border-radius: 8px; } 
    :host(:focus-visible) mat-card { box-shadow: 0 0 0 3px var(--sys-primary); } 
    :host:focus-within mat-card { border-color: var(--sys-primary); box-shadow: 0px 4px 8px rgba(0,0,0,0.15); } 
    mat-card { height: 100%; display: flex; flex-direction: column; background-color: var(--sys-surface); color: var(--sys-text-primary); border: 1px solid var(--sys-surface-border); } 
    
    /* Using custom header div to bypass MatCardHeader content projection issues in tests/rendering */ 
    .widget-header { 
      padding: 0 8px 0 16px; height: 48px; border-bottom: 1px solid var(--sys-surface-border); background-color: var(--sys-background); display: flex; align-items: center; 
    } 
    .header-content { width: 100%; display: flex; justify-content: space-between; align-items: center; } 
    .title-group { display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1; } 
    .widget-type-chip { font-size: 10px; height: 20px; min-height: 20px; } 
    .action-group { display: flex; gap: 0; align-items: center; } 
    .icon-btn-compact { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; } 
    .icon-btn-compact mat-icon { font-size: 18px; width: 18px; height: 18px; } 
    
    mat-card-content { flex-grow: 1; padding: 0; position: relative; overflow: hidden; min-height: 150px; } 
    .viz-container { height: 100%; width: 100%; overflow: auto; } 
    .center-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.8); backdrop-filter: blur(2px); z-index: 10; } 
    .skeleton-wrapper { padding: 16px; height: 100%; box-sizing: border-box; } 
    .safe-mode-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; background-color: #fff3e0; color: #e65100; padding: 16px; text-align: center; } 
    .safe-mode-title { font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; } 
    .safe-mode-desc { font-size: 12px; margin-bottom: 16px; opacity: 0.8; max-width: 90%; word-break: break-word; } 
    .animate-spin { animation: spin 1s linear infinite; } 
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } 
  `], 
  template: `
    <mat-card appearance="outlined">
      <!-- Custom Header instead of mat-card-header for robust projection -->
      <div class="widget-header">
        <div class="header-content">
          <div class="title-group">
             <span class="text-sm font-medium uppercase truncate" [title]="widgetInput().title" style="color: var(--sys-text-primary)">
                {{ widgetInput().title }} 
             </span>
             <mat-chip-set><mat-chip class="widget-type-chip" [color]="getChipColor()" highlighted>{{ widgetInput().type }}</mat-chip></mat-chip-set>
          </div>
          <div class="action-group">
            <button mat-icon-button class="icon-btn-compact" (click)="toggleFocus()" [matTooltip]="isFocused() ? 'Minimize' : 'Full Screen'" [attr.aria-label]="isFocused() ? 'Close Fullscreen' : 'Open Fullscreen'" style="color: var(--sys-text-secondary)">
              <mat-icon>{{ isFocused() ? 'close_fullscreen' : 'open_in_full' }}</mat-icon>
            </button>
            @if (isEditMode()) { 
              <button mat-icon-button class="icon-btn-compact" (click)="duplicate.emit()" matTooltip="Duplicate" data-testid="btn-duplicate" style="color: var(--sys-text-secondary)"><mat-icon>content_copy</mat-icon></button>
              <button mat-icon-button class="icon-btn-compact" (click)="edit.emit()" matTooltip="Edit" data-testid="btn-edit" style="color: var(--sys-text-secondary)"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button class="icon-btn-compact" (click)="delete.emit()" matTooltip="Delete" data-testid="btn-delete" style="color: var(--sys-warn)"><mat-icon>delete</mat-icon></button>
            } 
            @if (widgetInput().type !== 'TEXT') { 
              <button mat-icon-button class="icon-btn-compact" (click)="manualRefresh()" [disabled]="isLoadingLocal()" matTooltip="Refresh" style="color: var(--sys-primary)">
                 <mat-icon [class.animate-spin]="isLoadingLocal()">refresh</mat-icon>
              </button>
            } 
          </div>
        </div>
      </div>

      <mat-card-content>
        @if (errorMessage(); as error) { 
          <div class="center-overlay p-4" data-testid="error-state" style="color: var(--sys-warn)">
             <mat-icon class="text-4xl mb-2">warning</mat-icon>
             <span class="text-sm font-medium text-center">{{ error }}</span>
             @if (isEditMode()) { 
               <button mat-stroked-button color="warn" class="mt-4" (click)="edit.emit()" data-testid="btn-fix-query">Fix Query</button>
             } 
          </div>
        } @else if (isLoadingLocal()) { 
           <div class="skeleton-wrapper" data-testid="loading-state">
             <app-skeleton-loader [variant]="skeletonType()"></app-skeleton-loader>
           </div>
        } @else { 
          <div class="viz-container" *appErrorBoundary="safeModeTpl">
            @switch (visualizationType()) { 
              <!-- Table and Metric receive full config to handle thresholds -->
              @case ('table') { <viz-table [dataSet]="typedDataAsTable()" [config]="widgetInput().config"></viz-table> } 
              @case ('metric') { <viz-metric [data]="rawResult()" [titleOverride]="widgetInput().title" [config]="widgetInput().config"></viz-metric> } 
              @case ('scalar') { <viz-scalar [data]="rawResult()"></viz-scalar> } 
              @case ('bar_chart') { <viz-chart [dataSet]="typedDataAsTable()" [config]="chartConfig()"></viz-chart> } 
              @case ('line_graph') { <viz-chart [dataSet]="typedDataAsTable()" [config]="chartConfig()"></viz-chart> } 
              @case ('pie') { <viz-pie [dataSet]="typedDataAsTable()"></viz-pie> } 
              @case ('heatmap') { <viz-heatmap [dataSet]="typedDataAsTable()"></viz-heatmap> } 
              @case ('markdown') { <viz-markdown [content]="widgetInput().config['content']"></viz-markdown> } 
              @default { <div class="center-overlay" style="color: var(--sys-text-secondary)">Unknown Viz</div> } 
            } 
          </div>
        } 
      </mat-card-content>
    </mat-card>

    <!-- Error Boundary with Reset -->
    <ng-template #safeModeTpl let-error let-retry="retry">
      <div class="safe-mode-container">
        <div class="safe-mode-title"><mat-icon>bug_report</mat-icon> Widget Crashed</div>
        <div class="safe-mode-desc">Error rendering visualization.<br><span class="font-mono text-xs">{{ error?.message || error }}</span></div>
        <div class="flex gap-2">
          <button mat-stroked-button color="warn" (click)="retry()">Retry</button>
          @if (isEditMode()) { 
            <button mat-stroked-button color="primary" (click)="resetWidget()">Reset to Safe Defaults</button>
          } 
        </div>
      </div>
    </ng-template>
  `
}) 
export class WidgetComponent { 
  private readonly store = inject(DashboardStore); 
  private readonly dashApi = inject(DashboardsService); 
  
  readonly widgetInput = input.required<WidgetResponse>({ alias: 'widget' }); 
  
  readonly edit = output<void>(); 
  readonly duplicate = output<void>(); 
  readonly delete = output<void>(); 

  readonly isLoadingLocal = computed(() => this.store.isWidgetLoading()(this.widgetInput().id)); 
  readonly rawResult = computed(() => this.store.dataMap()[this.widgetInput().id]); 
  readonly isEditMode = this.store.isEditMode; 
  readonly isFocused = computed(() => this.store.focusedWidgetId() === this.widgetInput().id); 
  readonly errorMessage = computed(() => { 
    const res = this.rawResult(); 
    return (res && res.error) ? res.error : null; 
  }); 

  readonly visualizationType = computed(() => { 
    if (this.widgetInput().type === 'TEXT') return 'markdown'; 
    return (this.widgetInput().visualization || 'table').toLowerCase(); 
  }); 
  
  readonly skeletonType = computed<SkeletonVariant>(() => { 
    const viz = this.visualizationType(); 
    if (viz.includes('chart') || viz.includes('graph')) return 'chart'; 
    if (viz === 'pie') return 'pie'; 
    if (viz.includes('metric') || viz.includes('scalar')) return 'metric'; 
    if (viz === 'table') return 'table'; 
    return 'card'; 
  }); 

  readonly typedDataAsTable = computed(() => this.rawResult() as TableDataSet); 
  readonly chartConfig = computed(() => this.widgetInput().config as ChartConfig); 

  manualRefresh(): void { this.store.refreshWidget(this.widgetInput().id); } 

  toggleFocus(): void { 
    const id = this.widgetInput().id; 
    const current = this.store.focusedWidgetId(); 
    this.store.setFocusedWidget(current === id ? null : id); 
  } 

  getChipColor(): string { 
    const type = this.widgetInput().type; 
    if (type === 'SQL') return 'primary'; 
    if (type === 'TEXT') return 'warn'; 
    return 'accent'; 
  } 

  onEscape(event: Event): void { 
    (event as KeyboardEvent).stopPropagation(); 
    if (this.isFocused()) { this.store.setFocusedWidget(null); } 
    else if (this.isEditMode()) { this.delete.emit(); } 
  } 

  onFocus(): void {} 

  /** 
   * Resets the widget to a safe table state with a trivial query. 
   */ 
  resetWidget(): void { 
    if (!confirm('Reset this widget configuration to a safe default?')) return; 
    
    const safeConfig = this.widgetInput().type === 'SQL' 
        ? { query: 'SELECT 1 as SafeMode' } 
        : {}; 
    
    const update: WidgetUpdate = { 
        visualization: 'table', 
        config: safeConfig 
    }; 

    this.dashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetInput().id, update) 
        .subscribe(() => { 
            this.store.loadDashboard(this.widgetInput().dashboard_id); 
        }); 
  } 
}