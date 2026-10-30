/**
 * @fileoverview Dashboard widget container component responsible for rendering the appropriate
 * visualization (table, chart, metric, pie, heatmap, scalar, markdown), skeleton loading states,
 * safe-mode error recovery, and widget toolbar actions.
 */
import { Component, input, output, inject, computed, linkedSignal, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { extractEventInputValue } from '../shared/utils/dom-event.utils';

import { DashboardStore } from '../dashboard/dashboard.store';
import { WidgetResponse, DashboardsService, WidgetUpdate } from '../api-client';
import { ConnectionStatusService } from '../core/health/connection-status.service';
import {
  SkeletonLoaderComponent,
  SkeletonVariant,
} from '../shared/components/skeleton-loader.component';
import { ErrorBoundaryDirective } from '../core/error/error-boundary.directive';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';

import { VizTableComponent } from '../shared/visualizations/viz-table/viz-table.component';
import { VizMetricComponent } from '../shared/visualizations/viz-metric/viz-metric.component';
import { VizChartComponent } from '../shared/visualizations/viz-chart/viz-chart.component';
import { VizPieComponent } from '../shared/visualizations/viz-pie/viz-pie.component';
import { VizHeatmapComponent } from '../shared/visualizations/viz-heatmap/viz-heatmap.component';
import { VizScalarComponent } from '../shared/visualizations/viz-scalar/viz-scalar.component';
import { VizMarkdownComponent } from '../shared/visualizations/viz-markdown/viz-markdown.component';
import { serializeTableToCsv, triggerBlobDownload } from '../shared/utils/csv-export.utils';
import { hasActiveCdkOverlay } from '../core/accessibility/cdk-overlay-state.utils';
import {
  extractExecutionErrorMessage,
  extractMarkdownContent,
  extractTabularExportRows,
  narrowRecordPayload,
  parseChartConfig,
  parseMetricData,
  parseScalarData,
  parseSqlWidgetConfig,
  parseTableDataSet,
} from './widget-data.guards';

/**
 * Default placeholder widget configuration used before a parent component binds `[widget]`.
 */
const DEFAULT_WIDGET: WidgetResponse = {
  id: '',
  dashboard_id: '',
  title: '',
  type: 'SQL',
  visualization: 'table',
  config: {},
};

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
    '(blur)': 'onBlur()',
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
        align-items: flex-start;
        border-bottom: 1px solid var(--sys-surface-border);
        min-height: 48px;
        gap: 8px;
      }

      .title-area {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-width: 0;
      }
      .title-text {
        font-size: 0.875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .subtitle-text {
        font-size: 0.75rem;
        line-height: 1.35;
        color: var(--sys-text-secondary);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
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
  readonly widgetInput = input<WidgetResponse>(DEFAULT_WIDGET, { alias: 'widget' });
  /** Whether the widget host element currently holds DOM keyboard/pointer focus. */
  readonly isHostFocused = signal(false);
  /** Emits when the user clicks the edit action on the widget. */
  readonly edit = output<void>();
  /** Emits when the user clicks the duplicate action on the widget. */
  readonly duplicate = output<void>();
  /** Emits when the user requests to delete the widget. */
  readonly delete = output<void>();

  /** Whether this specific widget is currently refreshing its data. */
  readonly isLoadingLocal = computed(() => this.store.isWidgetLoading()(this.widgetInput().id));
  /** Raw execution result payload for this widget from the dashboard store. */
  readonly rawResult = computed(() =>
    narrowRecordPayload(this.store.dataMap()[this.widgetInput().id]),
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
  readonly errorMessage = computed(() => extractExecutionErrorMessage(this.rawResult()));

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

  /** Resolves the widget's subtitle or caption from top-level `subtitle` or `config` metadata. */
  readonly widgetSubtitle = computed<string | null>(() => {
    const w = this.widgetInput();
    if (typeof w.subtitle === 'string' && w.subtitle.trim().length > 0) {
      return w.subtitle.trim();
    }
    const cfg = w.config;
    const rawSub = cfg?.['subtitle'];
    if (typeof rawSub === 'string' && rawSub.trim().length > 0) {
      return rawSub.trim();
    }
    const rawDesc = cfg?.['description'];
    if (typeof rawDesc === 'string' && rawDesc.trim().length > 0) {
      return rawDesc.trim();
    }
    return null;
  });

  /** Skeleton loader variant matching the widget's visualization type. */
  readonly skeletonType = computed<SkeletonVariant>(() => {
    const viz = this.visualizationType();
    if (viz.includes('chart') || viz.includes('graph')) return 'chart';
    if (viz === 'pie') return 'pie';
    if (viz === 'heatmap') return 'heatmap';
    if (viz.includes('metric') || viz.includes('scalar')) return 'metric';
    if (viz === 'table') return 'table';
    return 'card';
  });

  /** Execution result typed as a `TableDataSet` for tabular and chart visualizations. */
  readonly typedDataAsTable = computed(() => parseTableDataSet(this.rawResult()));
  /** Execution result typed as `MetricData` for KPI metric visualizations. */
  readonly typedDataAsMetric = computed(() => parseMetricData(this.rawResult()));
  /** Execution result typed as `ScalarData` for scalar gauge visualizations. */
  readonly typedDataAsScalar = computed(() => parseScalarData(this.rawResult()));
  /** Visualization configuration dictionary extracted from the widget model. */
  readonly chartConfig = computed(() => parseChartConfig(this.widgetInput().config));
  /** Markdown content string extracted from the widget configuration. */
  readonly markdownContent = computed(() => extractMarkdownContent(this.widgetInput().config));

  /** Strongly typed SQL configuration fields parsed from `widgetInput().config`. */
  readonly sqlConfig = computed(() => parseSqlWidgetConfig(this.widgetInput().config));

  /** Whether this widget is configured to accept interactive natural text input on the dashboard. */
  readonly allowsNaturalText = computed(() => this.sqlConfig().allowNaturalText);

  /** Configured processor identifier (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`). */
  readonly configuredProcessor = computed(() => this.sqlConfig().processor);

  /** Active processor identifier bound to the widget's interactive execution bar. */
  readonly activeProcessor = linkedSignal<string>(() => this.configuredProcessor());

  /** Current user-entered natural text (or SQL) inside the widget input bar. */
  readonly naturalTextInput = linkedSignal<string>(() => this.sqlConfig().naturalTextPrompt);

  /** Placeholder text displayed in the widget's natural text input field. */
  readonly placeholderText = computed(() => {
    const custom = this.sqlConfig().placeholderText;
    if (custom) {
      return custom;
    }
    return this.activeProcessor() === 'SQL'
      ? $localize`Enter DuckDB SQL query...`
      : $localize`Ask in natural language...`;
  });

  /** SQL query generated by the LLM or executed directly during the latest natural-text execution. */
  readonly generatedSql = computed(() => {
    const raw: unknown = this.rawResult()?.['generated_sql'];
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  });

  /** Processor identifier used for the most recent execution. */
  readonly processorUsed = computed(() => {
    const raw: unknown = this.rawResult()?.['processor_used'];
    return typeof raw === 'string' && raw.length > 0 ? raw : this.activeProcessor();
  });

  /** Localized display label for `processorUsed()` in the widget header chip. */
  readonly processorDisplayLabel = computed(() => {
    const proc = this.processorUsed();
    return proc === 'SQL' ? $localize`SQL [no model]` : proc;
  });

  /**
   * Updates `naturalTextInput` from a DOM input event.
   *
   * @param event - DOM input event from the natural text field.
   */
  updateNaturalTextInput(event: Event): void {
    this.naturalTextInput.set(extractEventInputValue(event));
  }

  /**
   * Submits the current `naturalTextInput` to the backend via `DashboardStore.refreshWidget`
   * using `activeProcessor()`.
   */
  submitNaturalText(): void {
    const text = this.naturalTextInput().trim();
    if (!text) return;
    this.store.refreshWidget(this.widgetInput().id, true, {
      naturalText: text,
      processor: this.activeProcessor(),
    });
  }

  /** Triggers an immediate data refresh for this widget. */
  manualRefresh(): void {
    this.store.refreshWidget(this.widgetInput().id);
  }

  /** Opens the system connection diagnostics dialog. */
  openDiagnostics(): void {
    this.connectionService.openDiagnosticsDialog();
  }

  /** Navigates to the optimization workspace pre-populated with this widget's SQL query or template ID. */
  simulateWidget(): void {
    const widget = this.widgetInput();
    const cfg = this.sqlConfig();
    if (widget.type === 'SQL' && cfg.query) {
      this.router.navigate(['/optimization'], {
        queryParams: { prompt: cfg.query },
      });
    } else if (widget.type === 'TEMPLATE' && cfg.templateId) {
      this.router.navigate(['/optimization'], {
        queryParams: { templateId: cfg.templateId },
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
   * Handles the Escape key press to clear widget fullscreen focus when no higher-layer CDK dialog/menu overlay is open.
   *
   * @param event - Keyboard event triggered by pressing Escape.
   */
  onEscape(event: Event): void {
    if (this.isFocused() && !hasActiveCdkOverlay(this.document)) {
      event.stopPropagation();
      this.store.setFocusedWidget(null);
    }
  }

  /**
   * Marks the widget host element as focused when it receives DOM focus.
   *
   * @param _event - Optional DOM focus event.
   */
  onFocus(_event?: FocusEvent): void {
    this.isHostFocused.set(true);
  }

  /**
   * Clears the host focus indicator when DOM focus leaves the widget host element.
   *
   * @param _event - Optional DOM blur event.
   */
  onBlur(_event?: FocusEvent): void {
    this.isHostFocused.set(false);
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
    const raw = extractTabularExportRows(this.rawResult());
    const csvContent = serializeTableToCsv(raw);
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const filename = `${this.widgetInput().title || 'widget'}_export.csv`;
    triggerBlobDownload(this.document, blob, filename, false);
  }
}
