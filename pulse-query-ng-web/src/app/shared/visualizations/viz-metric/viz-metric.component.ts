/**
 * @fileoverview Single-value KPI metric card visualization component with sparkline trend and threshold alerts.
 */

import { Component, input, computed, Signal } from '@angular/core';

/**
 * Input data payload accepted by `VizMetricComponent`.
 */
export interface MetricData {
  /** Primary scalar metric value to display. */
  value?: number | string;
  /** Descriptive label for the KPI metric. */
  label?: string;
  /** Percentage or absolute delta trend value. */
  trend?: number;
  /** Historical numeric series used to render the background SVG sparkline. */
  trend_data?: number[];
  /** Optional tabular row array when fed directly from a SQL query result. */
  data?: Record<string, unknown>[];
  /** Optional column names corresponding to `data` rows. */
  columns?: string[];
  [key: string]: unknown;
}

/**
 * Optional threshold configuration for coloring metric values in warning or critical states.
 */
export interface MetricConfig {
  /** Numeric warning and critical threshold bounds. */
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/**
 * Displays a prominent KPI metric value, label, directional trend indicator, and SVG sparkline.
 */
@Component({
  selector: 'viz-metric',
  imports: [],

  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        text-align: center;
        padding: 16px;
        position: relative;
        overflow: hidden;
      }
      .metric-value {
        font-weight: 500;
        color: var(--sys-primary);
        margin-bottom: 8px;
        transition: color 0.3s ease;
        position: relative;
        z-index: 2;
      }
      .metric-label {
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--sys-text-secondary);
        position: relative;
        z-index: 2;
      }
      .trend {
        margin-top: 8px;
        font-weight: bold;
        position: relative;
        z-index: 2;
      }
      .trend-pos {
        color: var(--sys-success, #2e7d32);
      }
      .trend-neg {
        color: var(--sys-error);
      }
      .val-warn {
        color: var(--sys-warn) !important;
      }
      .val-critical {
        color: var(--sys-error) !important;
        font-weight: 700;
        transform: scale(1.1);
      }
      .sparkline-container {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 60%;
        opacity: 0.15;
        z-index: 1;
        pointer-events: none;
      }
      .spark-pos {
        stroke: var(--sys-success, #2e7d32);
      }
      .spark-neg {
        stroke: var(--sys-error);
      }
      .spark-fill-pos {
        fill: var(--sys-success, #2e7d32);
        opacity: 0.2;
      }
      .spark-fill-neg {
        fill: var(--sys-error);
        opacity: 0.2;
      }
    `,
  ],
  templateUrl: './viz-metric.component.html',
})
export class VizMetricComponent {
  /** Raw metric data object or tabular query result. */
  readonly data = input<MetricData | null>();
  /** Optional explicit label overriding the dataset's inferred column or label name. */
  readonly titleOverride = input<string>('');
  /** Optional threshold configuration for warning and critical state styling. */
  readonly config = input<MetricConfig | null>(null);

  /** Computed primary scalar value extracted from the metric data payload. */
  readonly displayValue: Signal<string | number> = computed(() => {
    const d = this.data();
    if (d === null || d === undefined) return '-';
    if (typeof d === 'number') return d;
    if (typeof d !== 'object') return String(d);

    if ('value' in d && !Array.isArray(d)) return d.value ?? '-';

    if (Array.isArray(d.data) && d.data.length > 0) {
      const firstRow = d.data[0] || {};
      const keys = Object.keys(firstRow);
      if (keys.length === 0) return '-';
      const cellVal = firstRow[String(keys[0])];
      return typeof cellVal === 'number' ? cellVal : String(cellVal);
    }

    if (!Array.isArray(d)) {
      const keys = Object.keys(d);
      for (const k of keys) {
        const val = d[k];
        if (typeof val === 'number') return val;
      }
    }
    return '-';
  });

  /** Computed human-readable label displayed beneath the metric value. */
  readonly displayLabel: Signal<string> = computed(() => {
    const override = this.titleOverride();
    if (override) return override;
    const d = this.data();
    if (!d || typeof d !== 'object') return '';
    if (Array.isArray(d.data) && Array.isArray(d.columns) && d.columns.length > 0) {
      return String(d.columns[0]);
    }
    if ('label' in d) return d.label ?? '';
    return '';
  });

  /** Computed numeric trend delta, or `null` if no trend is provided. */
  readonly parsedTrend: Signal<number | null> = computed(() => {
    const d = this.data();
    if (d && typeof d === 'object' && 'trend' in d) {
      return d.trend ?? null;
    }
    return null;
  });

  /** Computed array of historical numeric values used to plot the sparkline. */
  readonly trendSeries: Signal<number[]> = computed(() => {
    const d = this.data();
    if (d && typeof d === 'object' && Array.isArray(d.trend_data)) {
      return d.trend_data;
    }
    return [];
  });

  /** Computed boolean indicating whether the sparkline series finishes higher than or equal to its start. */
  readonly isTrendUp = computed(() => {
    const series = this.trendSeries();
    const first = series[0];
    const last = series[series.length - 1];
    if (first === undefined || last === undefined || series.length < 2) return true;
    return last >= first;
  });

  /** Computed SVG path command (`d` attribute) for the sparkline stroke, or `null` when insufficient points exist. */
  readonly sparklinePath = computed<string | null>(() => {
    const raw = this.trendSeries();
    if (!raw || raw.length < 2) return null;

    const min = Math.min(...raw);
    const max = Math.max(...raw);
    const range = max - min || 1;

    const points = raw.map((val, index) => {
      const x = (index / (raw.length - 1)) * 100;
      const normalizedY = (val - min) / range;
      const y = 50 - (normalizedY * 40 + 5);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return 'M ' + points.join(' L ');
  });

  /** Computed closed SVG path command for the shaded area beneath the sparkline. */
  readonly sparklineFill = computed<string | null>(() => {
    const path = this.sparklinePath();
    if (!path) return null;
    return `${path} L 100,50 L 0,50 Z`;
  });

  /** Computed CSS class (`'val-warn'`, `'val-critical'`, or `''`) based on configured thresholds. */
  readonly alertClass: Signal<string> = computed(() => {
    const val = this.displayValue();
    const conf = this.config();

    if (typeof val !== 'number' || !conf?.thresholds) return '';

    const { warning, critical } = conf.thresholds;

    if (critical !== undefined && val >= critical) return 'val-critical';
    if (warning !== undefined && val >= warning) return 'val-warn';

    return '';
  });
}
