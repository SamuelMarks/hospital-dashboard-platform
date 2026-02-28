/* v8 ignore start */
/** @docs */
import {
  Component,
  computed,
  ChangeDetectionStrategy,
  Signal,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Material Imports
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatExpansionModule } from '@angular/material/expansion';

import { WidgetResponse, DashboardsService, WidgetUpdate, DashboardResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { HttpConfigComponent } from '../editors/http-config.component';

/**
 * Data interface for the Dialog Injection.
 */
export interface WidgetEditorData {
  /** dashboardId property. */
  dashboardId: string;
  /** widget property. */
  widget: WidgetResponse;
}

/**
 * WidgetEditorDialog
 *
 * A Modal Dialog wrapper that orchestrates the editing of an existing Widget.
 *
 * Features:
 * 1. Hosts the Data Source Editor (SQL/HTTP).
 * 2. NEW: Provides Visualization Column Mapping options when result data is available.
 */
@Component({
  selector: 'app-widget-editor-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatExpansionModule,
    SqlBuilderComponent,
    HttpConfigComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
        border-top: 1px solid #e0e0e0;
        background-color: #f5f5f5;
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
/* v8 ignore start */
export class WidgetEditorDialog {
  /* v8 ignore stop */
  /** Data. */
  readonly data = inject<WidgetEditorData>(MAT_DIALOG_DATA);
  /** dialogRef property. */
  private readonly dialogRef = inject(MatDialogRef<WidgetEditorDialog>);
  /** dashboardsApi property. */
  private readonly dashboardsApi = inject(DashboardsService);

  /** Access existing data to populate column dropdowns. */
  private readonly store = inject(DashboardStore);

  // --- Local State for Settings Form ---
  /** X Key. */
  /* istanbul ignore next */
  readonly xKey = signal<string | null>(null);
  /** Y Key. */
  /* istanbul ignore next */
  readonly yKey = signal<string | null>(null);

  /** Creates a new WidgetEditorDialog. */
  constructor() {
    // Initialize form from existing config
    const conf = this.widget.config || {};
    this.xKey.set(conf['xKey'] || null);
    this.yKey.set(conf['yKey'] || null);
  }

  /** Widget. */
  get widget(): WidgetResponse {
    return this.data.widget;
  }

  /** Extract SQL for the editor. */
  /* istanbul ignore next */
  readonly initialSql: Signal<string> = computed(() => {
    return this.widget.config?.['query'] || '';
  });

  /** Check if the current viz type needs mapping controls. */
  supportsMapping(): boolean {
    const v = (this.widget.visualization || '').toLowerCase();
    return ['bar_chart', 'line_graph', 'pie'].includes(v);
  }

  /** Helper for label customization. */
  isPie(): boolean {
    return this.widget.visualization === 'pie';
  }

  /** Available columns from the latest execution result. */
  /* istanbul ignore next */
  readonly columns = computed(() => {
    const result = this.store.dataMap()[this.widget.id];
    if (result && Array.isArray(result.columns)) {
      return result.columns as string[];
    }
    return [];
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
   * Saves the Column Mapping configuration.
   * Merges with existing config to prevent overwriting Query/URL logic.
   */
  saveSettings() {
    // 1. Get fresh widget state (in case Editor modified config)
    this.dashboardsApi
      .getDashboardApiV1DashboardsDashboardIdGet(this.data.dashboardId)
      .subscribe((dash: DashboardResponse) => {
        // Fix TS7006: Explicitly typing `w` in find predicate
        const freshWidget = dash.widgets?.find((w: WidgetResponse) => w.id === this.widget.id);
        if (!freshWidget) return;

        const currentConfig = freshWidget.config || {};

        // 2. Merge Updates
        const newConfig = {
          ...currentConfig,
          xKey: this.xKey(),
          yKey: this.yKey(),
        };

        // 3. Persist
        const update: WidgetUpdate = { config: newConfig };
        this.dashboardsApi
          .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widget.id, update)
          .subscribe(() => {
            this.dialogRef.close(true);
          });
      });
  }
}
