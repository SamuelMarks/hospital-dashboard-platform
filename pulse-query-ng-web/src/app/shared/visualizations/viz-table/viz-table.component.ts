/**
 * @fileoverview Paginated Material data table visualization component with delta formatting and threshold highlighting.
 */

import { Component, input, computed, viewChild, effect } from '@angular/core';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';

/**
 * Tabular dataset structure consumed by visualization components.
 */
export interface TableDataSet {
  /** Ordered list of column header identifiers. */
  columns: string[];
  /** Array of row objects keyed by column identifier. */
  data: Record<string, unknown>[];
}

/**
 * Optional configuration for conditional cell highlighting in `VizTableComponent`.
 */
export interface TableConfig {
  /** Numeric thresholds for warning and critical cell highlighting. */
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  /** Specific column name to evaluate against `thresholds`. */
  thresholdColumn?: string;
}

/**
 * Renders a paginated Material table with automatic sign formatting for delta columns
 * and threshold-based warning/critical cell styling.
 */
@Component({
  selector: 'viz-table',
  imports: [MatTableModule, MatPaginatorModule, MatSortModule],

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
        background-color: var(--sys-surface);
      }
      th.mat-header-cell {
        background: var(--sys-surface-variant);
        font-weight: 600;
        color: var(--sys-on-surface-variant);
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.04em;
        padding: 8px 12px;
        white-space: nowrap;
      }
      td.mat-cell {
        color: var(--sys-on-surface);
        border-bottom-color: var(--sys-surface-variant);
        padding: 8px 12px;
        font-size: 13px;
      }
      tr.mat-mdc-row:hover {
        background-color: color-mix(in srgb, var(--sys-primary) 6%, transparent);
      }
      .val-pos {
        color: var(--sys-success, #2e7d32);
        font-weight: 500;
      }
      .val-neg {
        color: var(--sys-error, #c62828);
        font-weight: 500;
      }
      .cell-warn {
        color: var(--sys-warn, #b26a00);
        font-weight: bold;
      }
      .cell-warn::before {
        content: '! ';
      }
      .cell-critical {
        color: var(--sys-error, #d32f2f);
        font-weight: 900;
        background-color: rgba(211, 47, 47, 0.05);
      }
      .cell-critical::before {
        content: '⚠ ';
      }
    `,
  ],
  templateUrl: './viz-table.component.html',
})
export class VizTableComponent {
  /** Tabular dataset containing column names and row records to render. */
  readonly dataSet = input<TableDataSet | null | undefined>();

  /** Optional threshold styling configuration for numeric alert columns. */
  readonly config = input<TableConfig | null | undefined>(null);

  /** Material table data source managing row sorting and pagination. */
  dataSource = new MatTableDataSource<Record<string, unknown>>([]);
  /** Reference to the Material paginator instance bound to `dataSource`. */
  readonly paginator = viewChild<MatPaginator>('paginator');
  /** Reference to the Material sort directive bound to `dataSource`. */
  readonly sort = viewChild(MatSort);

  /**
   * Registers a reactive effect that synchronizes incoming `dataSet` rows with `dataSource`, `paginator`, and `sort`.
   */
  constructor() {
    effect(() => {
      const db = this.dataSet();
      const paginator = this.paginator();
      this.dataSource.sort = this.sort() ?? null;
      if (db?.data) {
        this.dataSource.data = db.data;
        if (paginator) {
          this.dataSource.paginator = paginator;
        }
      } else {
        this.dataSource.data = [];
      }
    });
  }

  /** Computed array of column identifiers to render in the table header and rows. */
  readonly finalColumns = computed(() => this.dataSet()?.columns || []);

  /** Whether the table has enough rows (`> 5`) to warrant showing the full pagination footer. */
  readonly showPaginator = computed(() => (this.dataSet()?.data?.length ?? 0) > 5);

  /**
   * Formats a raw column identifier into a human-readable header label while preserving uppercase acronyms.
   *
   * @param col - Raw column identifier from the SQL result set.
   * @returns Human-readable header label.
   */
  formatHeaderLabel(col: string): string {
    return col.replace(/_/g, ' ');
  }

  /**
   * Formats a raw cell value for display, adding explicit `+` signs to positive delta columns,
   * rounding floating-point numbers with excessive decimal places, and serializing nested objects as JSON.
   *
   * @param row - Data record representing the current table row.
   * @param col - Column key whose value should be formatted.
   * @returns Formatted display string for the table cell.
   */
  getCellValue(row: Record<string, unknown>, col: string): string {
    const val = row[col];
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    if (typeof val === 'number') {
      const formattedNum = Number.isInteger(val)
        ? String(val)
        : String(Math.round(val * 100) / 100);
      if (this.isDeltaColumn(col)) {
        return (val > 0 ? '+' : '') + formattedNum;
      }
      return formattedNum;
    }
    return String(val);
  }

  /**
   * Computes space-delimited CSS classes for a table cell based on delta sign and configured alert thresholds.
   *
   * @param row - Data record representing the current table row.
   * @param col - Column key being styled.
   * @returns Space-separated CSS class string (`'val-pos'`, `'val-neg'`, `'cell-warn'`, `'cell-critical'`).
   */
  getCellClass(row: Record<string, unknown>, col: string): string {
    let classes = '';
    const val = row[col];

    if (this.isDeltaColumn(col) && typeof val === 'number') {
      if (val > 0) classes += 'val-pos ';
      if (val < 0) classes += 'val-neg ';
    }

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

  /**
   * Computes an accessible label for cells with warning or critical threshold states
   * so severity is not conveyed by color alone (WCAG 1.4.1).
   *
   * @param row - Data record representing the current table row.
   * @param col - Column key being evaluated.
   * @returns Localized ARIA label when a threshold is breached, or `null` otherwise.
   */
  getCellAriaLabel(row: Record<string, unknown>, col: string): string | null {
    const classes = this.getCellClass(row, col);
    const val = this.getCellValue(row, col);
    if (classes.includes('cell-critical')) {
      return $localize`Critical: ${val}`;
    }
    if (classes.includes('cell-warn')) {
      return $localize`Warning: ${val}`;
    }
    return null;
  }

  /**
   * Checks whether a column name represents a directional change or net flow metric.
   *
   * @param col - Column identifier to inspect.
   * @returns True if the column name indicates a delta, change, or net flow value.
   */
  private isDeltaColumn(col: string): boolean {
    const lower = col.toLowerCase();
    return lower === 'delta' || lower.includes('change') || lower.includes('net_flow');
  }

  /**
   * Determines whether a column is eligible for threshold-based warning/critical highlighting.
   *
   * @param col - Column identifier to check.
   * @returns True if the column matches `thresholdColumn` or contains a capacity/utilization keyword.
   */
  private isAlertCandidate(col: string): boolean {
    const conf = this.config();
    if (conf?.thresholdColumn) return col === conf.thresholdColumn;
    const lower = col.toLowerCase();
    return ['count', 'cnt', 'census', 'load', 'utilization', 'capacity'].some((k) =>
      lower.includes(k),
    );
  }
}
