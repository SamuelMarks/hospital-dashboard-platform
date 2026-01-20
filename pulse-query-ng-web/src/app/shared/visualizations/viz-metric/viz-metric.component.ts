/**
 * @fileoverview Single Value ("Big Number") Visualization with Sparklines.
 * Supports Trend Indicators, simple textual fallback, Conditional Alert Thresholds,
 * and Micro-Chart (Sparkline) rendering.
 */

import { Component, input, computed, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Standard Metric Data Contract.
 */
export interface MetricData {
  value: number | string;
  label?: string;
  trend?: number;
  /** Array of numeric values for sparkline rendering. */
  trend_data?: number[];
}

/**
 * Partial configuration schema for threshold logic.
 */
export interface MetricConfig {
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/**
 * Visualization: Metric Card.
 *
 * **Features:**
 * - Displays primary value with Material Headline typography.
 * - Supports trend indicator (green/red) if `trend` property exists in data.
 * - **Alerting:** Applies styling classes (`text-warn`, `text-critical`) if value exceeds configured thresholds.
 * - **Micro-Charts:** Renders an SVG Sparkline if `trend_data` is provided.
 */
@Component({
  selector: 'viz-metric',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; text-align: center; padding: 16px; position: relative; overflow: hidden;
    }
    .metric-value {
      font-weight: 500; color: #1976d2; /* Primary Blue */ margin-bottom: 8px;
      transition: color 0.3s ease; position: relative; z-index: 2;
    }
    .metric-label {
      text-transform: uppercase; letter-spacing: 0.5px; color: rgba(0,0,0,0.6); position: relative; z-index: 2;
    }
    .trend { margin-top: 8px; font-weight: bold; position: relative; z-index: 2; }
    .trend-pos { color: #2e7d32; }
    .trend-neg { color: #c62828; }

    /* Conditional Threshold Styles */
    .val-warn { color: var(--sys-warn, #ffa000) !important; }
    .val-critical { color: var(--sys-error, #d32f2f) !important; font-weight: 700; transform: scale(1.1); }

    /* Sparkline Layer */
    .sparkline-container {
      position: absolute; bottom: 0; left: 0; width: 100%; height: 60%;
      opacity: 0.15; z-index: 1; pointer-events: none;
    }
    .spark-pos { stroke: #2e7d32; }
    .spark-neg { stroke: #c62828; }
    .spark-fill-pos { fill: #2e7d32; opacity: 0.2; }
    .spark-fill-neg { fill: #c62828; opacity: 0.2; }
  `],
  template: `
    <!-- Sparkline Background -->
    @if (sparklinePath(); as path) {
      <svg class="sparkline-container" viewBox="0 0 100 50" preserveAspectRatio="none">
        <path 
          [attr.d]="path" 
          fill="none" 
          stroke-width="2" 
          vector-effect="non-scaling-stroke"
          [ngClass]="isTrendUp() ? 'spark-pos' : 'spark-neg'"
        ></path>
        <path 
          [attr.d]="sparklineFill()" 
          stroke="none" 
          [ngClass]="isTrendUp() ? 'spark-fill-pos' : 'spark-fill-neg'"
        ></path>
      </svg>
    }

    <!-- Primary Value -->
    <div class="mat-headline-2 metric-value" [ngClass]="alertClass()">
      {{ displayValue() }}
    </div>

    <!-- Label -->
    <div class="mat-body-2 metric-label">
      {{ displayLabel() }}
    </div>

    <!-- Trend Indicator -->
    @if (parsedTrend() !== null) {
      <div 
        class="mat-caption trend" 
        [ngClass]="parsedTrend()! > 0 ? 'trend-pos' : 'trend-neg'" 
      >
        <span aria-hidden="true">{{ parsedTrend()! > 0 ? '▲' : '▼' }}</span>
        {{ parsedTrend() }}%
      </div>
    }
  `
})
export class VizMetricComponent {
  /** Input Data: Can be primitive, SQL Result Set, or Metric Objects. */
  readonly data = input<any | null>();
  /** Override title provided by parent widget wrapper. */
  readonly titleOverride = input<string>('');
  /** Configuration object containing optional thresholds. */
  readonly config = input<MetricConfig | null>(null);

  /** Extracted Value for display. */
  readonly displayValue: Signal<string | number> = computed(() => {
    const d = this.data();
    if (d === null || d === undefined) return '-';
    if (typeof d !== 'number' && typeof d !== 'object') return String(d);

    // Shape: Explicit Metric Object
    if (typeof d === 'object' && 'value' in d && !Array.isArray(d)) return d.value;
    
    // Shape: DuckDB Table Result
    if (typeof d === 'object' && Array.isArray(d.data) && d.data.length > 0) {
      const firstRow = d.data[0];
      const keys = Object.keys(firstRow);
      return keys.length > 0 ? firstRow[keys[0]] : '-';
    }
    
    // Shape: Simple Object
    if (typeof d === 'object' && !Array.isArray(d)) {
        const keys = Object.keys(d);
        for (const k of keys) {
            if (typeof d[k] === 'number') return d[k];
        }
    }
    
    // Primitive number
    if (typeof d === 'number') return d;

    return '-';
  });

  /** Extracted Label. */
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

  /** Optional trend percentage. */
  readonly parsedTrend: Signal<number | null> = computed(() => {
    const d = this.data();
    if (d && typeof d === 'object' && 'trend' in d) {
        return d.trend;
    }
    return null;
  });

  /** Trend Series extraction. */
  readonly trendSeries: Signal<number[]> = computed(() => {
    const d = this.data();
    // 1. Explicit property
    if (d && typeof d === 'object' && Array.isArray(d.trend_data)) {
        return d.trend_data;
    }
    return [];
  });

  readonly isTrendUp = computed(() => {
    const series = this.trendSeries();
    if (series.length < 2) return true;
    return series[series.length - 1] >= series[0];
  });

  /**
   * Generates SVG Path Data for the Sparkline Stroke.
   * Maps data points to a 100x50 coordinate system.
   */
  readonly sparklinePath = computed<string | null>(() => {
    const raw = this.trendSeries();
    if (!raw || raw.length < 2) return null;

    const min = Math.min(...raw);
    const max = Math.max(...raw);
    // Avoid division by zero if flat line
    const range = (max - min) || 1; 

    // Normalize to 0-100 (x) and 0-50 (y, inverted)
    const points = raw.map((val, index) => {
      const x = (index / (raw.length - 1)) * 100;
      const normalizedY = (val - min) / range; // 0.0 to 1.0
      const y = 50 - (normalizedY * 40 + 5); // 5px padding, inverted
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return 'M ' + points.join(' L ');
  });

  /**
   * Generates SVG Path Data for the Area Fill.
   * Closes the path loop to the bottom edge.
   */
  readonly sparklineFill = computed<string | null>(() => {
    const path = this.sparklinePath();
    if (!path) return null;
    // Append lines to bottom-right (100,50) and bottom-left (0,50) then close
    return `${path} L 100,50 L 0,50 Z`;
  });

  /** Computes the CSS class based on thresholds. */
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