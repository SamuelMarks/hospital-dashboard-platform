/* v8 ignore start */
/** @docs */
// pulse-query-ng-web/src/app/shared/visualizations/viz-metric/viz-metric.component.ts
import { Component, input, computed, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/** @docs */
export interface MetricData {
  value: number | string;
  label?: string;
  trend?: number;
  trend_data?: number[];
}

/** @docs */
export interface MetricConfig {
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/** @docs */
@Component({
  selector: 'viz-metric',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
/** @docs */
export class VizMetricComponent {
  /* v8 ignore next */
  readonly data = input<any | null>();
  /* v8 ignore next */
  readonly titleOverride = input<string>('');
  /* v8 ignore next */
  readonly config = input<MetricConfig | null>(null);

  /* v8 ignore next */
  readonly displayValue: Signal<string | number> = computed(() => {
    const d = this.data();
    if (d === null || d === undefined) return '-';
    if (typeof d !== 'number' && typeof d !== 'object') return String(d);
    if (typeof d === 'object' && 'value' in d && !Array.isArray(d)) return d.value;

    if (typeof d === 'object' && Array.isArray(d.data) && d.data.length > 0) {
      const firstRow = d.data[0];
      const keys = Object.keys(firstRow);
      return keys.length > 0 ? firstRow[keys[0]] : '-';
    }

    if (typeof d === 'object' && !Array.isArray(d)) {
      const keys = Object.keys(d);
      for (const k of keys) {
        if (typeof d[k] === 'number') return d[k];
      }
    }
    if (typeof d === 'number') return d;
    return '-';
  });

  /* v8 ignore next */
  readonly displayLabel: Signal<string> = computed(() => {
    const override = this.titleOverride();
    if (override) return override;
    const d = this.data();
    if (!d || typeof d !== 'object') return '';
    if (Array.isArray(d.data) && d.columns?.length > 0) {
      return d.columns[0];
    }
    if ('label' in d) return d.label;
    return '';
  });

  /* v8 ignore next */
  readonly parsedTrend: Signal<number | null> = computed(() => {
    const d = this.data();
    if (d && typeof d === 'object' && 'trend' in d) {
      return d.trend;
    }
    return null;
  });

  /* v8 ignore next */
  readonly trendSeries: Signal<number[]> = computed(() => {
    const d = this.data();
    if (d && typeof d === 'object' && Array.isArray(d.trend_data)) {
      return d.trend_data;
    }
    return [];
  });

  /* v8 ignore next */
  readonly isTrendUp = computed(() => {
    const series = this.trendSeries();
    if (series.length < 2) return true;
    return series[series.length - 1] >= series[0];
  });

  /* v8 ignore next */
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

  /* v8 ignore next */
  readonly sparklineFill = computed<string | null>(() => {
    const path = this.sparklinePath();
    if (!path) return null;
    return `${path} L 100,50 L 0,50 Z`;
  });

  /* v8 ignore next */
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
