// pulse-query-ng-web/src/app/shared/visualizations/viz-table/viz-table.component.ts
import {
  Component,
  input,
  computed,
  ChangeDetectionStrategy,
  ViewChild,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';

export interface TableDataSet {
  columns: string[];
  data: Record<string, any>[];
}

export interface TableConfig {
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  thresholdColumn?: string;
}

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
        background-color: var(--sys-surface);
      }
      th.mat-header-cell {
        background: var(--sys-surface-variant);
        font-weight: 600;
        color: var(--sys-on-surface-variant);
        text-transform: uppercase;
        font-size: 11px;
      }
      td.mat-cell {
        color: var(--sys-on-surface);
        border-bottom-color: var(--sys-surface-variant);
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
  /* v8 ignore next */
  readonly dataSet = input<TableDataSet | null | undefined>();
  /* v8 ignore next */
  readonly config = input<TableConfig | null>(null);

  dataSource = new MatTableDataSource<Record<string, any>>([]);
  @ViewChild(MatPaginator) paginator!: MatPaginator;

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

  /* v8 ignore next */
  readonly finalColumns = computed(() => this.dataSet()?.columns || []);

  getCellValue(row: Record<string, any>, col: string): string {
    const val = row[col];
    if (val === null || val === undefined) return '-';
    if (typeof val === 'object') return JSON.stringify(val);
    if (this.isDeltaColumn(col) && typeof val === 'number') {
      return (val > 0 ? '+' : '') + val;
    }
    return String(val);
  }

  getCellClass(row: Record<string, any>, col: string): string {
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

  private isDeltaColumn(col: string): boolean {
    const lower = col.toLowerCase();
    return lower === 'delta' || lower.includes('change') || lower.includes('net_flow');
  }

  private isAlertCandidate(col: string): boolean {
    const conf = this.config();
    if (conf?.thresholdColumn) return col === conf.thresholdColumn;
    const lower = col.toLowerCase();
    return ['count', 'cnt', 'census', 'load', 'utilization', 'capacity'].some((k) =>
      lower.includes(k),
    );
  }
}
