/**
 * @fileoverview Generic Wrapper Component for Dashboard Widgets.
 * 
 * Orchestrates:
 * - Data fetching status (Loading/Error/Success).
 * - Visualization switching (Chart/Table/Metric).
 * - Standardized Header/Actions (Edit/Delete).
 * - Error Safety via ErrorBoundary.
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
import { WidgetResponse } from '../api-client'; 
import { SkeletonLoaderComponent, SkeletonVariant } from '../shared/components/skeleton-loader.component'; 
import { ErrorBoundaryDirective } from '../core/error/error-boundary.directive'; 

// Child Visualizations
import { VizTableComponent, TableDataSet } from '../shared/visualizations/viz-table/viz-table.component'; 
import { VizMetricComponent } from '../shared/visualizations/viz-metric/viz-metric.component'; 
import { VizChartComponent, ChartConfig } from '../shared/visualizations/viz-chart/viz-chart.component'; 
import { VizPieComponent } from '../shared/visualizations/viz-pie/viz-pie.component'; 
import { VizHeatmapComponent } from '../shared/visualizations/viz-heatmap/viz-heatmap.component'; 
import { VizScalarComponent } from '../shared/visualizations/viz-scalar/viz-scalar.component';

/**
 * Main Widget Wrapper.
 * 
 * **Best Practices Applied:**
 * - **Host Metadata:** Events like `keydown.escape` are bound in component metadata, avoiding decorators.
 * - **Focus Management:** The host element is focusable (`tabindex="0"`) to allow keyboard shortcuts.
 * - **Bindings:** Replaced structural directives with native control flow (`@if`, `@switch`).
 * - **Style Bindings:** Direct usage of `[class.x]` instead of `ngClass`.
 */
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
    VizScalarComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  // Bind host events and attributes here
  host: {
    'tabindex': '0',
    'class': 'widget-host',
    '(keydown.escape)': 'onEscape($event)',
    '(focus)': 'onFocus()'
  },
  styles: [`
    :host { 
      display: block; 
      height: 100%; 
      outline: none; 
      border-radius: 8px; /* Match card radius for focus ring */
    } 
    /* Accessibility Focus Ring */
    :host(:focus-visible) mat-card { 
      box-shadow: 0 0 0 3px var(--sys-primary); 
    } 
    :host:focus-within mat-card { 
      border-color: var(--sys-primary);
      box-shadow: 0px 4px 8px rgba(0,0,0,0.15); 
    } 
    mat-card { 
      height: 100%; 
      display: flex; 
      flex-direction: column; 
      transition: box-shadow 0.2s, border-color 0.2s; 
      background-color: var(--sys-surface); 
      color: var(--sys-text-primary); 
      border: 1px solid var(--sys-surface-border); 
    } 
    mat-card-header { 
      padding: 0 8px 0 16px; 
      height: 48px; 
      border-bottom: 1px solid var(--sys-surface-border); 
      background-color: var(--sys-background); 
      display: flex; 
      align-items: center; 
    } 
    .header-content { width: 100%; display: flex; justify-content: space-between; align-items: center; } 
    .title-group { display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1; } 
    .widget-type-chip { font-size: 10px; height: 20px; min-height: 20px; } 
    .action-group { display: flex; gap: 0; align-items: center; } 
    .icon-btn-compact { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; } 
    .icon-btn-compact mat-icon { font-size: 18px; width: 18px; height: 18px; } 
    mat-card-content { flex-grow: 1; padding: 0; position: relative; overflow: hidden; min-height: 150px; } 
    
    .viz-container { height: 100%; width: 100%; overflow: auto; } 
    
    /* Overlay States */
    .center-overlay { 
      position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; 
      background: rgba(255,255,255,0.8); 
      backdrop-filter: blur(2px); 
      z-index: 10; 
    } 
    .skeleton-wrapper { padding: 16px; height: 100%; box-sizing: border-box; } 

    /* Safe Mode / Error Boundary Style */
    .safe-mode-container { 
      display: flex; flex-direction: column; align-items: center; justify-content: center; 
      height: 100%; background-color: #fff3e0; color: #e65100; padding: 16px; text-align: center; 
    } 
    .safe-mode-title { font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; } 
    .safe-mode-desc { font-size: 12px; margin-bottom: 16px; opacity: 0.8; max-width: 90%; word-break: break-word; }
    
    /* Utility */
    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `], 
  template: `
    <mat-card appearance="outlined">
      <mat-card-header>
        <div class="header-content">
          <!-- Left: Title & Chip -->
          <div class="title-group">
             <span class="text-sm font-medium uppercase truncate" [title]="widgetInput().title" style="color: var(--sys-text-primary)">
                {{ widgetInput().title }} 
             </span>
             <mat-chip-set>
                <mat-chip class="widget-type-chip" [color]="widgetInput().type === 'SQL' ? 'primary' : 'accent'" highlighted>
                  {{ widgetInput().type }} 
                </mat-chip>
             </mat-chip-set>
          </div>
          
          <!-- Right: Actions -->
          <div class="action-group">
            <button mat-icon-button class="icon-btn-compact" (click)="edit.emit()" matTooltip="Edit" data-testid="btn-edit" aria-label="Edit Widget" style="color: var(--sys-text-secondary)">
              <mat-icon>edit</mat-icon>
            </button>
            <button mat-icon-button class="icon-btn-compact" (click)="delete.emit()" matTooltip="Delete" data-testid="btn-delete" aria-label="Delete Widget" style="color: var(--sys-warn)">
              <mat-icon>delete</mat-icon>
            </button>
            <button mat-icon-button class="icon-btn-compact" (click)="manualRefresh()" [disabled]="isLoadingLocal()" matTooltip="Refresh" aria-label="Refresh Data" style="color: var(--sys-primary)">
               <mat-icon [class.animate-spin]="isLoadingLocal()">refresh</mat-icon>
            </button>
          </div>
        </div>
      </mat-card-header>

      <mat-card-content>
        <!-- 1. Error State -->
        @if (errorMessage(); as error) { 
          <div class="center-overlay p-4" data-testid="error-state" style="color: var(--sys-warn)">
             <mat-icon class="text-4xl mb-2">warning</mat-icon>
             <span class="text-sm font-medium text-center">{{ error }}</span>
          </div>
        } 
        
        <!-- 2. Loading State (Skeleton) -->
        @else if (isLoadingLocal()) { 
           <div class="skeleton-wrapper" data-testid="loading-state">
             <app-skeleton-loader [variant]="skeletonType()"></app-skeleton-loader>
           </div>
        } 
        
        <!-- 3. Visualization Content -->
        @else { 
          <div class="viz-container" *appErrorBoundary="safeModeTpl">
            @switch (visualizationType()) { 
              @case ('table') { <viz-table [dataSet]="typedDataAsTable()"></viz-table> } 
              @case ('metric') { <viz-metric [data]="rawResult()" [titleOverride]="widgetInput().title"></viz-metric> } 
              @case ('scalar') { <viz-scalar [data]="rawResult()"></viz-scalar> } 
              @case ('bar_chart') { <viz-chart [dataSet]="typedDataAsTable()" [config]="chartConfig()"></viz-chart> } 
              @case ('line_graph') { <viz-chart [dataSet]="typedDataAsTable()" [config]="chartConfig()"></viz-chart> } 
              @case ('pie') { <viz-pie [dataSet]="typedDataAsTable()"></viz-pie> } 
              @case ('heatmap') { <viz-heatmap [dataSet]="typedDataAsTable()"></viz-heatmap> } 
              @default { <div class="center-overlay" style="color: var(--sys-text-secondary)">Unknown Viz: {{ visualizationType() }}</div> } 
            } 
          </div>
        } 
      </mat-card-content>
    </mat-card>

    <!-- Error Boundary Fallback Template -->
    <ng-template #safeModeTpl let-error let-retry="retry">
      <div class="safe-mode-container" data-testid="safe-mode">
        <div class="safe-mode-title">
          <mat-icon>bug_report</mat-icon> Widget Crashed
        </div>
        <div class="safe-mode-desc">
          Error rendering visualization.<br>
          <span class="font-mono text-xs">{{ error?.message || error }}</span>
        </div>
        <button mat-stroked-button color="warn" (click)="retry()">Retry</button>
      </div>
    </ng-template>
  `
}) 
export class WidgetComponent { 
  private readonly store = inject(DashboardStore); 
  
  /** Widget configuration input signal */
  readonly widgetInput = input.required<WidgetResponse>({ alias: 'widget' }); 
  
  /** Emits when edit button is clicked */
  readonly edit = output<void>(); 
  /** Emits when delete button is clicked or Escape key pressed */
  readonly delete = output<void>(); 

  // --- Computed Selectors ---

  /** True if this specific widget is pending API result. */
  readonly isLoadingLocal = computed(() => this.store.isWidgetLoading()(this.widgetInput().id)); 
  
  /** Raw data result for this widget from the store map. */
  readonly rawResult = computed(() => this.store.dataMap()[this.widgetInput().id]); 
  
  /** Errors extracted from the result set if any. */
  readonly errorMessage = computed(() => { 
    const res = this.rawResult(); 
    return (res && res.error) ? res.error : null; 
  }); 

  /** Normalized visualization type identifier. */
  readonly visualizationType = computed(() => (this.widgetInput().visualization || 'table').toLowerCase()); 
  
  /** Determines which skeleton loader variant to show. */
  readonly skeletonType = computed<SkeletonVariant>(() => { 
    const viz = this.visualizationType(); 
    if (viz.includes('chart') || viz.includes('graph') || viz === 'pie' || viz === 'heatmap') return 'chart'; 
    if (viz.includes('metric') || viz.includes('scalar')) return 'metric'; 
    if (viz === 'table') return 'table'; 
    return 'card'; 
  }); 

  /** Convenience casts for typed consumption in template. */
  readonly typedDataAsTable = computed(() => this.rawResult() as TableDataSet); 
  readonly chartConfig = computed(() => this.widgetInput().config as ChartConfig); 

  /** Manual reload trigger. */
  manualRefresh(): void { this.store.refreshWidget(this.widgetInput().id); } 

  // --- Host Listener Handlers (Called via metadata map) ---

  /** 
   * Handles Escape key press interaction.
   * Stops propagation to prevent closing parent dialogs accidentally.
   * Triggers Delete output as a shortcut action.
   * 
   * @param {Event} event - The keyboard event.
   */
  onEscape(event: Event): void { 
    (event as KeyboardEvent).stopPropagation(); 
    this.delete.emit(); 
  }

  /**
   * Tracks focus gain for accessibility debugging (optional hook).
   */
  onFocus(): void {
    // Hook for analytics or auto-selection logic if needed
  }
}