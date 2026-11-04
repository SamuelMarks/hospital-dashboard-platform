/**
 * @fileoverview Modal dialog component for editing an existing dashboard widget's
 * data source configuration, visualization type, SQL-to-visualization compatibility,
 * and visualization column mappings.
 */
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  Signal,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

// Material Imports
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatInputModule } from '@angular/material/input';

import { WidgetResponse, DashboardsService, WidgetUpdate, DashboardResponse } from '../api-client';
import { extractApiErrorMessage } from '../core/error.utils';
import { DashboardStore } from './dashboard.store';
import { extractWidgetColumns } from './dashboard.models';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { HttpConfigComponent } from '../editors/http-config.component';
import { ProcessorCatalogService } from '../shared/services/processor-catalog.service';
import { extractEventInputValue } from '../shared/utils/dom-event.utils';
import {
  normalizeVisualizationType,
  validateVisualizationCompatibility,
} from '../shared/visualizations/viz-compatibility.utils';
import { narrowRecordPayload, parseTableDataSet } from '../widget/widget-data.guards';
import { CANONICAL_VISUALIZATIONS } from './widget-builder/widget-builder.store';

/**
 * Data interface for the Dialog Injection.
 */
export interface WidgetEditorData {
  /** Unique identifier of the dashboard hosting the widget being edited. */
  dashboardId: string;
  /** Existing widget entity whose configuration is being edited. */
  widget: WidgetResponse;
}

/**
 * WidgetEditorDialog
 *
 * A Modal Dialog wrapper that orchestrates the editing of an existing Widget.
 *
 * Features:
 * 1. Hosts the Data Source Editor (SQL/HTTP).
 * 2. Provides Visualization Type switching and SQL-to-visualization compatibility validation.
 * 3. Provides Visualization Column Mapping options when result data is available.
 */
@Component({
  selector: 'app-widget-editor-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatSlideToggleModule,
    MatInputModule,
    SqlBuilderComponent,
    HttpConfigComponent,
  ],
  host: {
    '(keydown.escape)': 'dialogRef.close(false)',
  },

  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100vh;
        max-height: 100vh;
        width: 100%;
      }
      mat-dialog-content {
        flex-grow: 1;
        padding: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        max-height: 80vh;
      }
      .viz-settings-panel {
        border-top: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface-variant);
        color: var(--sys-on-surface);
        padding: 16px;
      }
      .settings-grid {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 16px;
        align-items: center;
      }
    `,
  ],
  templateUrl: './widget-editor.dialog.html',
})
export class WidgetEditorDialog implements OnInit {
  /** Injected dialog data containing the target dashboard ID and widget entity. */
  readonly data = inject<WidgetEditorData>(MAT_DIALOG_DATA);
  /** Reference to the active Material dialog instance hosting this editor. */
  private readonly dialogRef = inject(MatDialogRef<WidgetEditorDialog>);
  /** Generated OpenAPI client for persisting widget configuration updates. */
  private readonly dashboardsApi = inject(DashboardsService);

  /** Access existing data to populate column dropdowns. */
  private readonly store = inject(DashboardStore);
  /** Destroy reference for cancelling in-flight HTTP requests when the dialog closes. */
  private readonly destroyRef = inject(DestroyRef);
  /** Processor catalog service providing `SQL [no model]`, Ollama models, and `any-llm` models. */
  readonly processorCatalog = inject(ProcessorCatalogService);

  /** Canonical visualization options selectable in the editor. */
  readonly availableVisualizations = CANONICAL_VISUALIZATIONS;

  /** Whether a widget update operation is currently in progress. */
  readonly isSaving = signal(false);

  /** Latest error message encountered while saving widget settings, or `null`. */
  readonly errorMessage = signal<string | null>(null);

  /** Optional user-selected visualization type override when changed in the editor. */
  readonly selectedVisualization = signal<string | null>(null);

  /** Editable widget title synchronized from widget configuration. */
  readonly title = linkedSignal<string>(() => this.data.widget.title || '');

  /** Editable widget subtitle or caption synchronized from widget metadata or config. */
  readonly subtitle = linkedSignal<string>(() => {
    const topSub = this.data.widget.subtitle;
    if (typeof topSub === 'string' && topSub.trim().length > 0) {
      return topSub.trim();
    }
    const cfgSub = this.data.widget.config['subtitle'];
    if (typeof cfgSub === 'string' && cfgSub.trim().length > 0) {
      return cfgSub.trim();
    }
    const cfgDesc = this.data.widget.config['description'];
    return typeof cfgDesc === 'string' ? cfgDesc.trim() : '';
  });

  /** Selected horizontal axis or category column key synchronized from widget configuration. */
  readonly xKey = linkedSignal<string | null>(() => {
    const raw: unknown = this.data.widget.config['xKey'];
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  });

  /** Selected vertical axis or metric value column key synchronized from widget configuration. */
  readonly yKey = linkedSignal<string | null>(() => {
    const raw: unknown = this.data.widget.config['yKey'];
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  });

  /** Whether the widget allows user natural text input on the dashboard. */
  readonly allowNaturalText = linkedSignal<boolean>(() =>
    Boolean(this.data.widget.config['allow_natural_text']),
  );

  /** Selected processor ID (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`). */
  readonly processor = linkedSignal<string>(() => {
    const raw: unknown = this.data.widget.config['processor'];
    return typeof raw === 'string' && raw.length > 0 ? raw : 'SQL';
  });

  /** Default or saved natural text prompt synchronized from widget configuration. */
  readonly naturalTextPrompt = linkedSignal<string>(() => {
    const raw: unknown = this.data.widget.config['natural_text_prompt'];
    return typeof raw === 'string' ? raw : '';
  });

  /** Optional custom placeholder text synchronized from widget configuration. */
  readonly placeholderText = linkedSignal<string>(() => {
    const raw: unknown = this.data.widget.config['placeholder_text'];
    return typeof raw === 'string' ? raw : '';
  });

  /** Loads available processors (`SQL [no model]`, Ollama models, `any-llm` models) on dialog init. */
  ngOnInit(): void {
    this.processorCatalog.loadProcessors();
  }

  /**
   * Extracts the string value from a DOM input event.
   *
   * @param event - DOM input event.
   * @returns Extracted string value.
   */
  getEventValue(event: Event): string {
    return extractEventInputValue(event);
  }

  /** Target widget entity currently being edited in the dialog. */
  get widget(): WidgetResponse {
    return this.data.widget;
  }

  /**
   * Returns the effective visualization identifier (user override if selected, otherwise `widget.visualization`).
   *
   * @returns Active visualization type string.
   */
  effectiveVisualization(): string {
    return this.selectedVisualization() ?? this.widget.visualization;
  }

  /**
   * Updates `selectedVisualization` when the user chooses a new visualization type in the editor.
   *
   * @param viz - Selected canonical visualization identifier.
   */
  updateVisualization(viz: string): void {
    const trimmed = viz.trim();
    if (trimmed) {
      this.selectedVisualization.set(trimmed);
    }
  }

  /** Extract SQL for the editor. */
  readonly initialSql: Signal<string> = computed(() => {
    const query = this.widget.config['query'];
    return typeof query === 'string' ? query : '';
  });

  /**
   * Check if the current viz type needs mapping controls.
   *
   * @returns True if the visualization type supports column mapping.
   */
  supportsMapping(): boolean {
    const norm = normalizeVisualizationType(this.effectiveVisualization(), this.widget.type);
    return ['bar_chart', 'line_chart', 'pie_chart', 'heatmap'].includes(norm);
  }

  /**
   * Helper for label customization.
   *
   * @returns True if the visualization type is a pie chart.
   */
  isPie(): boolean {
    return (
      normalizeVisualizationType(this.effectiveVisualization(), this.widget.type) === 'pie_chart'
    );
  }

  /** Available columns from the latest execution result. */
  readonly columns = computed(() => {
    return extractWidgetColumns(this.store.dataMap()[this.widget.id]);
  });

  /**
   * Computed SQL-to-visualization compatibility status for the active widget dataset and editor settings.
   */
  readonly vizCompatibility = computed(() => {
    const raw = this.selectedVisualization() ?? this.widget.visualization;
    const ds = parseTableDataSet(narrowRecordPayload(this.store.dataMap()[this.widget.id]));
    return validateVisualizationCompatibility(
      raw,
      ds,
      {
        xKey: this.xKey(),
        yKey: this.yKey(),
      },
      this.widget.type,
    );
  });

  /**
   * Called when the internal editor (SQL/HTTP) saves.
   * We refrain from closing immediately to allow Viz editing if desired,
   * or we can close if the user is done.
   * For this UX, we do NOT close automatically anymore, allowing standard workflow.
   */
  handleEditorSave(): void {
    // Reload dashboard to get new widgetConfig (incase editor wiped it)
    // and refresh columns.
    this.store.loadDashboard(this.data.dashboardId);
  }

  /**
   * Saves the Column Mapping and Visualization configuration.
   * Merges with existing config to prevent overwriting Query/URL logic.
   */
  saveSettings(): void {
    this.isSaving.set(true);
    this.errorMessage.set(null);

    // 1. Get fresh widget state (in case Editor modified config)
    this.dashboardsApi
      .getDashboardApiV1DashboardsDashboardIdGet(this.data.dashboardId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dash: DashboardResponse) => {
          const freshWidget = dash.widgets.find((w: WidgetResponse) => w.id === this.widget.id);
          if (!freshWidget) {
            this.isSaving.set(false);
            return;
          }

          const currentConfig = freshWidget.config;
          const extraSqlConfig: Record<string, unknown> = {};
          if (
            this.widget.type === 'SQL' &&
            (this.allowNaturalText() ||
              this.processor() !== 'SQL' ||
              'allow_natural_text' in currentConfig ||
              'processor' in currentConfig)
          ) {
            extraSqlConfig['allow_natural_text'] = this.allowNaturalText();
            extraSqlConfig['processor'] = this.processor();
            if (this.naturalTextPrompt().trim()) {
              extraSqlConfig['natural_text_prompt'] = this.naturalTextPrompt().trim();
            }
            if (this.placeholderText().trim()) {
              extraSqlConfig['placeholder_text'] = this.placeholderText().trim();
            }
          }

          const trimmedTitle = this.title().trim() || freshWidget.title;
          const trimmedSubtitle = this.subtitle().trim();

          // 2. Merge Updates
          const newConfig: Record<string, unknown> = {
            ...currentConfig,
            xKey: this.xKey(),
            yKey: this.yKey(),
            ...extraSqlConfig,
          };
          if (trimmedSubtitle) {
            newConfig['subtitle'] = trimmedSubtitle;
          } else {
            delete newConfig['subtitle'];
          }

          // 3. Persist
          const chosenViz = this.selectedVisualization();
          const update: WidgetUpdate = {
            title: trimmedTitle,
            subtitle: trimmedSubtitle || null,
            ...(chosenViz ? { visualization: chosenViz } : {}),
            config: newConfig,
          };
          this.dashboardsApi
            .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widget.id, update)
            .pipe(
              takeUntilDestroyed(this.destroyRef),
              finalize(() => this.isSaving.set(false)),
            )
            .subscribe({
              next: () => {
                this.dialogRef.close(true);
              },
              error: (err: unknown) => {
                this.errorMessage.set(
                  extractApiErrorMessage(err, $localize`Failed to update widget configuration.`),
                );
              },
            });
        },
        error: (err: unknown) => {
          this.isSaving.set(false);
          this.errorMessage.set(
            extractApiErrorMessage(err, $localize`Failed to update widget configuration.`),
          );
        },
      });
  }
}
