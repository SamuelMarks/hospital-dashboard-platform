/**
 * @fileoverview Responsive bar and stacked-column chart visualization component
 * with dynamic Material 3 theme palette integration and threshold reference lines.
 */

import { Component, input, computed, inject, effect, signal, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ThemeService } from '../../../core/theme/theme.service';
import { inferChartAxisKeys } from '../viz-axis-inference.utils';

/**
 * Configuration for reference lines (e.g. thresholds).
 */
export interface ChartReferenceLine {
  /** Y-axis value at which the horizontal reference line is drawn. */
  y: number;
  /** Optional text label rendered alongside the reference line. */
  label?: string;
  /** Optional CSS color string overriding the default reference line color. */
  color?: string;
  /** Optional stroke style for the reference line. */
  style?: 'solid' | 'dashed' | 'dotted';
}

/**
 * Configuration schema passed from parent widgets.
 */
export interface ChartConfig {
  /** Column name mapped to the horizontal X-axis categories. */
  xKey?: string;
  /** Column name mapped to the vertical Y-axis numeric values. */
  yKey?: string;
  /** Optional column name used to group bars into stacked segments. */
  stackBy?: string;
  /** Optional list of horizontal threshold reference lines rendered across the plot area. */
  referenceLines?: ChartReferenceLine[];
}

/**
 * Internal representation for chart rendering logic.
 */
interface ChartItem {
  /** Stacked bar segments when `isStacked` is true. */
  segments?: {
    label: string;
    value: number;
    color: string;
    heightPct: string;
    bottomPct: string;
  }[];
  /** Category label displayed on the X-axis. */
  label: string;
  /** Total numeric value represented by the bar. */
  value: number;
  /** CSS height percentage string for non-stacked bars. */
  heightPct: string;
  /** CSS bottom offset percentage string relative to the zero baseline. */
  bottomPct: string;
  /** Whether the bar represents a negative numeric value. */
  isNegative: boolean;
  /** Whether the bar is composed of multiple stacked segments. */
  isStacked: boolean;
}

/**
 * Visualization: Bar/Column Chart.
 *
 * **Updates**:
 * - Consumes Runtime CSS Variables for chart colors via `ThemeService`.
 * - Reacts to theme changes instantly without reloading.
 */
@Component({
  selector: 'viz-chart',
  imports: [],

  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
        padding: 16px;
      }
      .wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .header {
        display: flex;
        justify-content: space-between;
        color: var(--sys-text-secondary);
        font-size: 10px;
        font-weight: 500;
        text-transform: uppercase;
        margin-bottom: 8px;
      }
      .plot-area {
        flex-grow: 1;
        position: relative;
        border-left: 1px solid var(--sys-surface-border);
        min-height: 100px;
        margin-left: 8px;
      }
      .bars-container {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 4px;
        z-index: 10;
        padding-bottom: 1px;
      }
      .col-wrapper {
        flex: 1;
        height: 100%;
        position: relative;
      }

      .bar-segment {
        position: absolute;
        width: 100%;
        transition:
          height 0.3s,
          bottom 0.3s;
      }
      .col-wrapper:hover .bar-segment {
        opacity: 0.9;
      }

      .bar {
        position: absolute;
        width: 100%;
        border-radius: 2px 2px 0 0;
        transition: all 0.3s;
      }
      /* Default fallback colors if JS palette not loaded yet */
      .bar-pos {
        background-color: var(--chart-color-1, #1976d2);
      }
      .bar-neg {
        background-color: var(--chart-neg, #f44336);
      }
      .col-wrapper:hover .bar {
        opacity: 0.8;
      }

      .x-axis {
        margin-top: 4px;
        margin-left: 8px;
        height: 24px;
        border-top: 1px solid var(--sys-surface-border);
        display: flex;
        justify-content: space-between;
        gap: 4px;
      }
      .x-label {
        flex: 1;
        text-align: center;
        font-size: 10px;
        color: var(--sys-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding-top: 4px;
      }

      .tooltip {
        visibility: hidden;
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: 100%;
        background: var(--sys-surface-border);
        color: var(--sys-text-primary);
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 10px;
        white-space: pre;
        z-index: 20;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        border: 1px solid var(--sys-text-secondary);
        pointer-events: none;
      }
      .col-wrapper:hover .tooltip,
      .col-wrapper:focus-within .tooltip {
        visibility: visible;
      }
    `,
  ],
  templateUrl: './viz-chart.component.html',
})
export class VizChartComponent {
  /** Tabular dataset containing rows and columns to plot. */
  readonly dataSet = input<
    | {
        columns?: string[];
        data: Record<string, unknown>[];
      }
    | null
    | undefined
  >(null);
  /** Optional chart axis and stacking configuration. */
  readonly config = input<ChartConfig | undefined>();

  /** Injected DOM document reference used to read computed CSS custom properties. */
  private readonly document = inject(DOCUMENT);
  /** Angular platform identifier used to guard browser-only DOM queries. */
  private readonly platformId = inject(PLATFORM_ID);
  /** Reactive theme service triggering palette updates when appearance changes. */
  private readonly themeService = inject(ThemeService);

  /**
   * Reactive Palette Signal.
   * Stores the resolved hex codes from CSS variables.
   */
  readonly palette = signal<string[]>([]);

  /**
   * Initializes the reactive theme effect to synchronize chart colors with DOM CSS variables.
   */
  constructor() {
    // Reads CSS variables whenever theme changes
    effect(() => {
      // Dependency trigger
      this.themeService.seedColor();
      this.themeService.isDark();

      if (isPlatformBrowser(this.platformId)) {
        // Small delay to allow Paint to settle variables
        requestAnimationFrame(() => this.updatePaletteFromDom());
      }
    });
  }

  /**
   * Extracts runtime CSS variables for charting consistency.
   */
  updatePaletteFromDom(): void {
    const style = getComputedStyle(this.document.documentElement);

    // We expect these to be populated by ThemeService/ColorUtils
    const p1 = style.getPropertyValue('--chart-color-1').trim() || '#1976d2';
    const p2 = style.getPropertyValue('--chart-color-2').trim() || '#585e71';
    const p3 = style.getPropertyValue('--chart-color-3').trim() || '#735471';
    const neg = style.getPropertyValue('--chart-neg').trim() || '#ba1a1a';

    this.palette.set([p1, p2, p3, '#fbc02d', '#7b1fa2', '#e64a19', '#0288d1', neg]);
  }

  /**
   * Helper to safely access palette by index.
   *
   * @param index - Zero-based series index, or `-1` for the negative value color.
   * @returns Resolved hexadecimal color string.
   */
  getPalette(index: number): string {
    const colors = this.palette();
    if (colors.length === 0) return index === -1 ? '#ba1a1a' : '#1976d2';
    const targetIdx = index === -1 ? colors.length - 1 : index % (colors.length - 1);
    return String(colors[targetIdx]);
  }

  /**
   * Determines X and Y keys for plotting.
   */
  readonly axisKeys = computed(() => {
    const ds = this.dataSet();
    const conf = this.config();
    const firstRow = ds?.data?.[0];
    if (!ds || !firstRow) return { x: '', y: '', stack: '' };
    return inferChartAxisKeys(ds.columns, firstRow, conf);
  });

  /**
   * Localized ARIA summary label describing the chart axes and item count.
   */
  readonly chartAriaLabel = computed(() => {
    const { x, y } = this.axisKeys();
    const yName = y || $localize`Value`;
    const xName = x || $localize`Category`;
    const count = this.processedData().length;
    return $localize`Bar chart: ${yName} by ${xName} (${count} items)`;
  });

  /**
   * Computes the renderable data structure.
   */
  readonly processedData = computed<ChartItem[]>(() => {
    const ds = this.dataSet();
    const { x, y, stack } = this.axisKeys();

    // Dependency on palette ensures re-computation on theme change
    this.palette();

    if (!ds || !x || !y) return [];

    if (stack) {
      return this.processStackedData(ds.data, x, y, stack);
    }
    return this.processSimpleData(ds.data, x, y);
  });

  /**
   * Computes the maximum Y value across configured reference lines so the plot scale includes them.
   *
   * @returns Maximum reference line Y value, or `0` if none are configured.
   */
  private getRefMax(): number {
    return (this.config()?.referenceLines || []).reduce((acc, l) => Math.max(acc, l.y), 0);
  }

  /**
   * Processing Strategy for Standard Bar Charts.
   *
   * @param rows - Array of data records to transform into bar items.
   * @param xKey - Column name providing category labels on the X-axis.
   * @param yKey - Column name providing numeric heights on the Y-axis.
   * @returns Array of normalized `ChartItem` entries for template rendering.
   */
  private processSimpleData(
    rows: Record<string, unknown>[],
    xKey: string,
    yKey: string,
  ): ChartItem[] {
    const values = rows.map((r) => Number(r[yKey]) || 0);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0, this.getRefMax());
    const range = max - min || 10;

    // Calculate where "Zero" sits in percentage terms relative to min
    const zeroPct = ((0 - min) / range) * 100;

    return rows.map((row) => {
      const val = Number(row[yKey]) || 0;
      const isNeg = val < 0;
      const hPct = (Math.abs(val) / range) * 100;

      // If negative, bottom starts at (zeroPct - height). If positive, starts at zeroPct.
      const bPct = isNeg ? zeroPct - hPct : zeroPct;

      return {
        label: String(row[xKey]),
        value: val,
        heightPct: `${hPct}%`,
        bottomPct: `${bPct}%`,
        isNegative: isNeg,
        isStacked: false,
      };
    });
  }

  /**
   * Processing Strategy for Stacked Bar Charts.
   *
   * @param rows - Array of data records to group and stack.
   * @param xKey - Column name providing primary X-axis category groupings.
   * @param yKey - Column name providing numeric segment magnitudes.
   * @param stackKey - Column name providing sub-category series labels for stacking.
   * @returns Array of stacked `ChartItem` objects with positioned segments.
   */
  private processStackedData(
    rows: Record<string, unknown>[],
    xKey: string,
    yKey: string,
    stackKey: string,
  ): ChartItem[] {
    const groups: Record<string, { label: string; val: number; color: string }[]> = {};
    const colorMap: Record<string, string> = {};
    let ci = 0;

    rows.forEach((r) => {
      const xVal = String(r[xKey]);
      const stackVal = String(r[stackKey]);
      const yVal = Math.max(0, Number(r[yKey]) || 0);

      if (!groups[xVal]) groups[xVal] = [];
      if (!colorMap[stackVal]) {
        // Use dynamic palette logic
        colorMap[stackVal] = this.getPalette(ci++);
      }

      groups[xVal].push({ label: stackVal, val: yVal, color: colorMap[stackVal] });
    });

    let maxTotal = this.getRefMax();
    Object.values(groups).forEach((stackArr) => {
      const total = stackArr.reduce((sum, item) => sum + item.val, 0);
      if (total > maxTotal) maxTotal = total;
    });
    const scale = maxTotal || 1;

    return Object.entries(groups).map(([xLabel, stackArr]) => {
      let currentBottom = 0;

      const segments = stackArr.map((seg) => {
        const hPctNum = (seg.val / scale) * 100;
        const bPctNum = (currentBottom / scale) * 100;
        const segment = {
          label: seg.label,
          value: seg.val,
          color: seg.color,
          heightPct: `${hPctNum}%`,
          bottomPct: `${bPctNum}%`,
        };
        currentBottom += seg.val;
        return segment;
      });

      return {
        label: xLabel,
        value: currentBottom,
        heightPct: '',
        bottomPct: '',
        isNegative: false,
        isStacked: true,
        segments: segments.reverse(),
      };
    });
  }
}
