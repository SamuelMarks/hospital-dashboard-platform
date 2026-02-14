/**
 * @fileoverview Reusable Data Table Visualization.
 *
 * Adapts raw API datasets into an Angular Material Table structure.
 * Features:
 * - Dynamic Column generation relative to the dataset.
 * - Client-side Pagination.
 * - Conditional formatting for Delta/Change columns.
 * - **Alerting:** Schema-driven row highlighting based on thresholds.
 */

import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
  ViewChild,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';

// Material Imports
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';

/**
 * Data structure for the table.
 */
export interface TableDataSet {
  /** columns property. */
  columns: string[];
  /** data property. */
  data: Record<string, any>[];
}

/**
 * Configuration schema passed from the Dashboard Widget layer.
 */
export interface TableConfig {
  /** Map of thresholds. e.g. { warning: 80, critical: 90 } */
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  /**
   * Optional key to target for threshold validation.
   * If omitted, the table heuristics will try to find the primary metric column.
   */
  thresholdColumn?: string;
}

/** Viz Table component. */
@Component({
  selector: 'viz-table',
  imports: [CommonModule, MatTableModule, MatPaginatorModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .table-container {
        flex-grow: 1;
        overflow: auto;
      }
      table {
        width: 100%;
      }
      th.mat-header-cell {
        background: #fafafa;
        font-weight: 600;
        color: #616161;
        text-transform: uppercase;
        font-size: 11px;
      }

      /* Delta Formatting */
      .val-pos {
        color: #2e7d32;
        font-weight: 500;
      }
      .val-neg {
        color: #c62828;
        font-weight: 500;
      }

      /* Alert Formatting (Cell Level) */
      .cell-warn {
        color: var(--sys-warn, #ffa000);
        font-weight: bold;
      }
      .cell-critical {
        color: var(--sys-error, #d32f2f);
        font-weight: 900;
        background-color: rgba(211, 47, 47, 0.05);
      }
    `,
  ],
  templateUrl: './viz-table.component.html',
})
export class VizTableComponent {
  /** Data Set. */
  /* istanbul ignore next */
  readonly dataSet = input<TableDataSet | null | undefined>();
  /** Config. */
  /* istanbul ignore next */
  readonly config = input<TableConfig | null>(null);

  /** Data Source. */
  dataSource = new MatTableDataSource<Record<string, any>>([]);
  /** Paginator. */
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  /** Creates a new VizTableComponent. */
  constructor() {
    effect(() => {
      const db = this.dataSet();
      if (db?.data) {
        this.dataSource.data = db.data;
        if (this.paginator) {
          this.dataSource.paginator = this.paginator;
        }
      } else {
        this.dataSource.data = [];
      }
    });
  }

  /** Final Columns. */
  /* istanbul ignore next */
  readonly finalColumns = computed(() => this.dataSet()?.columns || []);

  /** Gets cell Value. */
  getCellValue(row: Record<string, any>, col: string): string {
    const val = row[col];
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    // Format Delta with sign
    if (this.isDeltaColumn(col) && typeof val === 'number') {
      return (val > 0 ? '+' : '') + val;
    }
    return String(val);
  }

  /**
   * Determines classes for a specific cell.
   * Combines heuristic delta-coloring with configuration-driven threshold alerts.
   */
  getCellClass(row: Record<string, any>, col: string): string {
    let classes = '';
    const val = row[col];

    // 1. Delta Heuristics
    if (this.isDeltaColumn(col) && typeof val === 'number') {
      if (val > 0) classes += 'val-pos ';
      if (val < 0) classes += 'val-neg ';
    }

    // 2. Threshold Alerts
    // Only apply if this column is numeric AND is a candidate for alerting
    if (typeof val === 'number' && this.isAlertCandidate(col)) {
      const conf = this.config();

      if (conf?.thresholds) {
        const { warning, critical } = conf.thresholds;
        if (critical !== undefined && val >= critical) {
          classes += 'cell-critical ';
        } else if (warning !== undefined && val >= warning) {
          classes += 'cell-warn ';
        }
      }
    }

    return classes.trim();
  }

  /** isDeltaColumn method. */
  private isDeltaColumn(col: string): boolean {
    const lower = col.toLowerCase();
    return lower === 'delta' || lower.includes('change') || lower.includes('net_flow');
  }

  /**
   * Determines if a column should be checked against the configured thresholds.
   * Prioritizes specific config `thresholdColumn`, otherwise defaults to standard metric names.
   */
  private isAlertCandidate(col: string): boolean {
    const conf = this.config();
    if (conf?.thresholdColumn) {
      return col === conf.thresholdColumn;
    }
    // Heuristic: Alerts usually apply to counts, capacity, utilization, census
    const lower = col.toLowerCase();
    return ['count', 'cnt', 'census', 'load', 'utilization', 'capacity'].some((k) =>
      lower.includes(k),
    );
  }
}
