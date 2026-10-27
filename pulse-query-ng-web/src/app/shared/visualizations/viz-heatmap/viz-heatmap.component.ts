/**
 * @fileoverview Two-dimensional matrix heatmap visualization component for temporal and categorical intensity data.
 */

import { Component, input, computed } from '@angular/core';
import { TableDataSet } from '../viz-table/viz-table.component';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Computed 2D heatmap matrix representation.
 */
export interface HeatmapMatrix {
  /** Sorted horizontal axis header labels. */
  xHeaders: string[];
  /** Sorted vertical axis header labels. */
  yHeaders: string[];
  /** Coordinate-to-value lookup map keyed by `${x}:${y}`. */
  dataMap: Map<string, number>;
  /** Minimum numeric value across all cells. */
  min: number;
  /** Maximum numeric value across all cells. */
  max: number;
}

/**
 * Renders a 2D CSS grid heatmap coloring each cell by its relative magnitude between dataset min and max.
 */
@Component({
  selector: 'viz-heatmap',
  imports: [MatTooltipModule],

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
        transition: border 0.1s;
      }
      .cell:hover,
      .cell:focus-visible {
        border: 1px solid var(--sys-on-surface);
        z-index: 10;
      }
      /* ... labels / legend styles ... */
      .legend-bar {
        width: 100px;
        height: 8px;
        background: linear-gradient(to right, var(--sys-surface-variant), var(--sys-error));
        border-radius: 4px;
      }
    `,
  ],
  templateUrl: './viz-heatmap.component.html',
})
export class VizHeatmapComponent {
  /** Tabular dataset whose first three columns represent Y category, X category, and numeric intensity. */
  readonly dataSet = input.required<TableDataSet | null>();

  /**
   * Computed 2D matrix representation containing sorted X/Y axis headers, a coordinate-to-value lookup map, and min/max bounds.
   */
  readonly matrix = computed<HeatmapMatrix | null>(() => {
    const ds = this.dataSet();
    if (!ds || ds.data.length === 0) return null;
    const cols = ds.columns;
    const yKey = String(cols[0]);
    const xKey = String(cols[1]);
    const valKey =
      cols.find((c) => c.toLowerCase() === 'net_bottleneck') ||
      String(cols.length > 3 ? cols[cols.length - 1] : cols[2]);

    const xSet = new Set<string>();
    const ySet = new Set<string>();
    const dataMap = new Map<string, number>();
    let min = 0,
      max = 0;

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

  /**
   * Computes a CSS `color-mix` expression blending `--sys-error` and `--sys-surface-variant`
   * proportionally to the cell's normalized value.
   *
   * @param m - Matrix metadata containing the value map and min/max domain bounds.
   * @param x - Horizontal axis key for the cell.
   * @param y - Vertical axis key for the cell.
   * @returns CSS `color-mix(...)` background color string.
   */
  getCellColor(m: HeatmapMatrix, x: string, y: string): string {
    const val = m.dataMap.get(`${x}:${y}`) || 0;
    const range = m.max - m.min || 1;
    const pct = (val - m.min) / range;

    return `color-mix(in srgb, var(--sys-error), var(--sys-surface-variant) ${100 - pct * 100}%)`;
  }

  /**
   * Builds a human-readable tooltip string for a specific heatmap cell coordinate.
   *
   * @param m - Matrix metadata containing the coordinate-to-value lookup map.
   * @param x - Horizontal axis coordinate label.
   * @param y - Vertical axis coordinate label.
   * @returns Formatted tooltip text displaying the Y label, X hour, and numeric value.
   */
  getCellTooltip(m: HeatmapMatrix, x: string, y: string): string {
    const val = m.dataMap.get(`${x}:${y}`) || 0;
    return $localize`${y} @ Hour ${x}\: ${val}`;
  }
}
