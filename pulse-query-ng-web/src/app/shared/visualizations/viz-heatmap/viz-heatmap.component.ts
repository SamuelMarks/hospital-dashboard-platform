/**
 * @fileoverview Heatmap Visualization.
 * Density Grid for Time-series or Category Analysis.
 */

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableDataSet } from '../viz-table/viz-table.component';
import { MatTooltipModule } from '@angular/material/tooltip';

/** Viz Heatmap component. */
@Component({
  selector: 'viz-heatmap',
  imports: [CommonModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
        overflow: auto;
        padding: 16px;
      }
      .heatmap-container {
        display: grid;
        gap: 2px;
        align-items: stretch;
        justify-items: stretch;
      }
      .cell {
        position: relative;
        width: 100%;
        min-width: 30px;
        height: 30px;
        border-radius: 2px;
      }
      .cell:hover {
        border: 1px solid #333;
        z-index: 10;
      }

      .axis-label {
        font-size: 10px;
        color: var(--sys-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .y-label {
        justify-content: flex-end;
        padding-right: 8px;
        font-weight: 500;
      }
      .x-label {
        font-weight: 500;
      }

      .legend {
        margin-top: 16px;
        font-size: 11px;
        color: var(--sys-text-secondary);
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: flex-end;
      }
      .legend-bar {
        width: 100px;
        height: 8px;
        background: linear-gradient(to right, #fff5f5, #b71c1c);
        border-radius: 4px;
      }
    `,
  ],
  templateUrl: './viz-heatmap.component.html',
})
export class VizHeatmapComponent {
  /** Data Set. */
  readonly dataSet = input.required<TableDataSet | null>();

  /** Matrix. */
  readonly matrix = computed(() => {
    const ds = this.dataSet();
    if (!ds || ds.data.length === 0) return null;

    // Detect Columns: Assumes [Service, Hour, Value]
    const cols = ds.columns;
    const yKey = cols[0]; // Dim 1 (Service)
    const xKey = cols[1]; // Dim 2 (Hour)
    const valKey = cols[2]; // Measure

    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const dataMap = new Map<string, number>();

    let min = 0;
    let max = 0;

    ds.data.forEach((row) => {
      const x = String(row[xKey]);
      const y = String(row[yKey]);
      const val = Number(row[valKey]) || 0;

      xSet.add(x);
      ySet.add(y);
      dataMap.set(`${x}:${y}`, val);

      if (val < min) min = val;
      if (val > max) max = val;
    });

    const xHeaders = Array.from(xSet).sort((a, b) => Number(a) - Number(b));
    const yHeaders = Array.from(ySet).sort();

    return { xHeaders, yHeaders, dataMap, min, max };
  });

  /** Gets cell Color. */
  getCellColor(m: any, x: string, y: string): string {
    const val = m.dataMap.get(`${x}:${y}`) || 0;
    const range = m.max - m.min || 1;
    const pct = (val - m.min) / range;

    // Scale: White -> Red (#b71c1c)
    return `rgba(183, 28, 28, ${Math.max(0.1, pct)})`;
  }

  /** Gets cell Tooltip. */
  getCellTooltip(m: any, x: string, y: string): string {
    const val = m.dataMap.get(`${x}:${y}`) || 0;
    return `${y} @ Hour ${x}: ${val}`;
  }
}
