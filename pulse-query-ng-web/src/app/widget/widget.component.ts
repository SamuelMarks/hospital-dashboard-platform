/**
 * @fileoverview Dashboard widget container component responsible for rendering the appropriate
 * visualization (table, chart, metric, pie, heatmap, scalar, markdown), skeleton loading states,
 * safe-mode error recovery, and widget toolbar actions.
 */
import { Component, input, output, inject, computed } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';

import { DashboardStore } from '../dashboard/dashboard.store';
import { WidgetResponse, DashboardsService, WidgetUpdate } from '../api-client';
import { ConnectionStatusService } from '../core/health/connection-status.service';
import {
  SkeletonLoaderComponent,
  SkeletonVariant,
} from '../shared/components/skeleton-loader.component';
import { ErrorBoundaryDirective } from '../core/error/error-boundary.directive';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';

import {
  VizTableComponent,
  TableDataSet,
} from '../shared/visualizations/viz-table/viz-table.component';
import {
  VizMetricComponent,
  MetricData,
} from '../shared/visualizations/viz-metric/viz-metric.component';
import {
  VizChartComponent,
  ChartConfig,
} from '../shared/visualizations/viz-chart/viz-chart.component';
import { VizPieComponent } from '../shared/visualizations/viz-pie/viz-pie.component';
import { VizHeatmapComponent } from '../shared/visualizations/viz-heatmap/viz-heatmap.component';
import {
  VizScalarComponent,
  ScalarData,
} from '../shared/visualizations/viz-scalar/viz-scalar.component';
import { VizMarkdownComponent } from '../shared/visualizations/viz-markdown/viz-markdown.component';
import { serializeTableToCsv, triggerBlobDownload } from '../shared/utils/csv-export.utils';

/**
 * Narrowing adapter converting a raw execution result dictionary to `TableDataSet`.
 *
 * @param raw - Raw execution result dictionary or null/undefined.
 * @returns Typed `TableDataSet` representation.
 */
function toTableDataSet(raw: Record<string, unknown> | null | undefined): TableDataSet {
  return raw as never as TableDataSet;
}

/**
 * Narrowing adapter converting a raw execution result dictionary to `MetricData | null`.
 *
 * @param raw - Raw execution result dictionary or null/undefined.
 * @returns Typed `MetricData | null` representation.
 */
function toMetricData(raw: Record<string, unknown> | null | undefined): MetricData | null {
  return raw as never as MetricData | null;
}

/**
 * Narrowing adapter converting a raw execution result dictionary to `ScalarData | null`.
 *
 * @param raw - Raw execution result dictionary or null/undefined.
 * @returns Typed `ScalarData | null` representation.
 */
function toScalarData(raw: Record<string, unknown> | null | undefined): ScalarData | null {
  return raw as never as ScalarData | null;
}

/**
 * Narrowing adapter converting a widget configuration dictionary to `ChartConfig`.
 *
 * @param config - Raw widget configuration dictionary.
 * @returns Typed `ChartConfig` representation.
 */
function toChartConfig(config: Record<string, unknown>): ChartConfig {
  return config as never as ChartConfig;
}

/**
 * Renders a single dashboard widget card with dynamic visualization switching and error recovery.
 */
@Component({
  selector: 'app-widget',
  imports: [
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
    VizMarkdownComponent,
  ],

  host: {
    tabindex: '0',
    class: 'widget-host',
    '(keydown.escape)': 'onEscape($event)',
    '(focus)': 'onFocus()',
  },
  templateUrl: './widget.component.html',
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        outline: none;
        transition: transform 0.2s;
      }

      /* M3 Elevation & Focus States */
      :host(:focus-visible) mat-card {
        outline: 2px solid var(--sys-primary);
        outline-offset: 2px;
      }
      /* Enhance elevation on focus within (Edit mode context) */
      :host:focus-within mat-card {
        border-color: var(--sys-primary);
        /* Approximation of Elevation Level 2 */
        box-shadow:
          0px 3px 1px -2px rgba(0, 0, 0, 0.2),
          0px 2px 2px 0px rgba(0, 0, 0, 0.14),
          0px 1px 5px 0px rgba(0, 0, 0, 0.12);
      }

      mat-card {
        height: 100%;
        display: flex;
        flex-direction: column;
        /* M3 Standard Surface Colors are handled by MatCard internally */
        background-color: var(--sys-surface);
        color: var(--sys-text-primary);
      }

      .widget-header-row {
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--sys-surface-border);
        min-height: 48px;
      }

      .title-area {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .title-text {
        font-size: 0.875rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .widget-chip {
        --mdc-chip-label-text-color: var(--sys-on-surface-variant);
        transform: scale(0.8);
        margin-left: -4px;
      }

      .action-group {
        display: flex;
        gap: 4px;
        align-items: center;
        margin-right: -8px;
      }
      .icon-btn-compact {
        width: 32px;
        height: 32px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn-compact mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      mat-card-content {
        flex-grow: 1;
        padding: 0;
        position: relative;
        overflow: hidden;
        min-height: 100px;
        display: flex;
        flex-direction: column;
      }

      .viz-container {
        flex-grow: 1;
        width: 100%;
        overflow: auto;
        position: relative;
      }

      /* Loading / Error Overlays */
      .center-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--sys-surface) 85%, transparent);
        backdrop-filter: blur(2px);
        z-index: 10;
      }
      .skeleton-wrapper {
        padding: 16px;
        height: 100%;
        box-sizing: border-box;
      }

      .safe-mode-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        background-color: var(--sys-error-container);
        color: var(--sys-on-error-container);
        padding: 16px;
        text-align: center;
      }
      .safe-mode-title {
        font-weight: bold;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .safe-mode-desc {
        font-size: 12px;
        margin-bottom: 16px;
        opacity: 0.8;
        max-width: 90%;
        word-break: break-word;
      }
      .animate-spin {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class WidgetComponent {
  /** Active dashboard state store. */
  private readonly store = inject(DashboardStore);
  /** Backend dashboards API service. */
  private readonly dashApi = inject(DashboardsService);
  /** Material dialog service for confirmation modals. */
  private readonly dialog = inject(MatDialog);
  /** Angular router for navigating to the scenario simulator. */
  private readonly router = inject(Router);
  /** Injected DOM document reference. */
  private readonly document = inject(DOCUMENT);
  /** Service monitoring backend and database connection health. */
  readonly connectionService = inject(ConnectionStatusService);

  /** Widget configuration and metadata model passed from the parent dashboard grid. */
  readonly widgetInput = input.required<WidgetResponse>({ alias: 'widget' });
  /** Emits when the user clicks the edit action on the widget. */
  readonly edit = output<void>();
  /** Emits when the user clicks the duplicate action on the widget. */
  readonly duplicate = output<void>();
  /** Emits when the user requests to delete the widget. */
  readonly delete = output<void>();

  /** Whether this specific widget is currently refreshing its data. */
  readonly isLoadingLocal = computed(() => this.store.isWidgetLoading()(this.widgetInput().id));
  /** Raw execution result payload for this widget from the dashboard store. */
  readonly rawResult = computed(
    () => this.store.dataMap()[this.widgetInput().id] as Record<string, unknown> | null,
  );
  /** Signal indicating whether the parent dashboard is in edit mode. */
  readonly isEditMode = this.store.isEditMode;
  /** Whether this widget currently holds keyboard/selection focus in the dashboard store. */
  readonly isFocused = computed(() => this.store.focusedWidgetId() === this.widgetInput().id);
  /** Computed localized label for the focus/fullscreen toggle button. */
  readonly focusLabel = computed(() =>
    this.isFocused() ? $localize`Minimize` : $localize`Full Screen`,
  );

  /** Execution error message extracted from the widget's latest result payload, if any. */
  readonly errorMessage = computed(() => {
    const res = this.rawResult();
    return res && (res as Record<string, unknown>)['error']
      ? ((res as Record<string, unknown>)['error'] as string)
      : null;
  });

  /** Whether the widget error indicates a missing DuckDB table. */
  readonly isMissingTableError = computed(() => {
    const err = this.errorMessage();
    return err ? err.includes('does not exist') || err.includes('TABLE_NOT_FOUND') : false;
  });

  /** Whether the widget error indicates the database engine is locked or unavailable. */
  readonly isDbUnavailableError = computed(() => {
    const err = this.errorMessage();
    return err
      ? err.includes('DATABASE_ERROR') || err.includes('database engine') || err.includes('locked')
      : false;
  });

  /** Normalized lowercase visualization type identifier for template switching. */
  readonly visualizationType = computed(() => {
    if (this.widgetInput().type === 'TEXT') return 'markdown';
    return (this.widgetInput().visualization || 'table').toLowerCase();
  });

  /** Skeleton loader variant matching the widget's visualization type. */
  readonly skeletonType = computed<SkeletonVariant>(() => {
    const viz = this.visualizationType();
    if (viz.includes('chart') || viz.includes('graph')) return 'chart';
    if (viz === 'pie') return 'pie';
    if (viz.includes('metric') || viz.includes('scalar')) return 'metric';
    if (viz === 'table') return 'table';
    return 'card';
  });

  /** Execution result typed as a `TableDataSet` for tabular and chart visualizations. */
  readonly typedDataAsTable = computed(() => toTableDataSet(this.rawResult()));
  /** Execution result typed as `MetricData` for KPI metric visualizations. */
  readonly typedDataAsMetric = computed(() => toMetricData(this.rawResult()));
  /** Execution result typed as `ScalarData` for scalar gauge visualizations. */
  readonly typedDataAsScalar = computed(() => toScalarData(this.rawResult()));
  /** Visualization configuration dictionary extracted from the widget model. */
  readonly chartConfig = computed(() => toChartConfig(this.widgetInput().config));
  /** Markdown content string extracted from the widget configuration. */
  readonly markdownContent = computed(() => this.widgetInput().config['content'] as string);

  /** Triggers an immediate data refresh for this widget. */
  manualRefresh(): void {
    this.store.refreshWidget(this.widgetInput().id);
  }

  /** Opens the system connection diagnostics dialog. */
  openDiagnostics(): void {
    this.connectionService.openDiagnosticsDialog();
  }

  /** Navigates to the scenario simulation page pre-populated with this widget's SQL query or template ID. */
  simulateWidget(): void {
    const widget = this.widgetInput();
    if (widget.type === 'SQL' && widget.config['query']) {
      this.router.navigate(['/simulation'], {
        queryParams: { sql: String(widget.config['query']) },
      });
    } else if (widget.type === 'TEMPLATE' && widget.config['template_id']) {
      this.router.navigate(['/simulation'], {
        queryParams: { templateId: String(widget.config['template_id']) },
      });
    }
  }

  /** Toggles the focused state of this widget in the dashboard store. */
  toggleFocus(): void {
    const id = this.widgetInput().id;
    const current = this.store.focusedWidgetId();
    this.store.setFocusedWidget(current === id ? null : id);
  }

  /**
   * Handles the Escape key press to clear widget focus or emit delete in edit mode.
   *
   * @param event - Keyboard event triggered by pressing Escape.
   */
  onEscape(event: Event): void {
    (event as KeyboardEvent).stopPropagation();
    if (this.isFocused()) {
      this.store.setFocusedWidget(null);
    } else if (this.isEditMode()) {
      this.delete.emit();
    }
  }

  /**
   * Synchronizes browser focus on host element with the dashboard store.
   * Ensures the focused widget state reflects active keyboard or mouse focus.
   *
   * @param _event - Optional DOM focus event.
   */
  onFocus(_event?: FocusEvent): void {
    const id = this.widgetInput().id;
    if (this.store.focusedWidgetId() !== id) {
      this.store.setFocusedWidget(id);
    }
  }

  /** Prompts for confirmation and resets the widget configuration to safe-mode defaults. */
  resetWidget(): void {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: $localize`Reset Widget`,
          message: $localize`This will reset configuration to defaults. Continue?`,
          isDestructive: true,
          confirmJson: $localize`Reset`,
        },
      })
      .afterClosed()
      .subscribe((res) => {
        if (res) {
          const safeConfig =
            this.widgetInput().type === 'SQL' ? { query: 'SELECT 1 as SafeMode' } : {};
          const update: WidgetUpdate = { visualization: 'table', config: safeConfig };
          this.dashApi
            .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetInput().id, update)
            .subscribe(() => {
              this.store.loadDashboard(this.widgetInput().dashboard_id);
            });
        }
      });
  }

  /**
   * Exports the widget's current tabular dataset to a downloadable CSV file.
   */
  exportWidgetData(): void {
    const res = this.rawResult();
    const raw = res && Array.isArray(res['data']) ? (res['data'] as Record<string, unknown>[]) : [];
    const csvContent = serializeTableToCsv(raw);
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const filename = `${this.widgetInput().title || 'widget'}_export.csv`;
    triggerBlobDownload(this.document, blob, filename, false);
  }
}
