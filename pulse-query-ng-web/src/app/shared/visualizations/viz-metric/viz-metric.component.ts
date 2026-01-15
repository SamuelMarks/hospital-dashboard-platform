/**
 * @fileoverview Single Value ("Big Number") Visualization.
 * Supports Trend Indicators and simple textual fallback.
 */

import { Component, input, computed, ChangeDetectionStrategy, Signal } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 

export interface MetricData { 
  value: number | string; 
  label?: string; 
  trend?: number; 
} 

/** 
 * Visualization: Metric Card.
 * 
 * **Features:**
 * - Displays primary value with Material Headline typography.
 * - Supports trend indicator (green/red) if `trend` property exists in data.
 */ 
@Component({ 
  selector: 'viz-metric', 
  // 'standalone: true' omitted
  imports: [CommonModule], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { 
      display: flex; flex-direction: column; align-items: center; justify-content: center; 
      height: 100%; text-align: center; padding: 16px; 
    } 
    .metric-value { 
      font-weight: 500; color: #1976d2; /* Primary Blue */ margin-bottom: 8px; 
    } 
    .metric-label { 
      text-transform: uppercase; letter-spacing: 0.5px; color: rgba(0,0,0,0.6); 
    } 
    .trend { margin-top: 8px; font-weight: bold; } 
    .trend-pos { color: #2e7d32; } 
    .trend-neg { color: #c62828; } 
  `], 
  template: `
    <!-- Primary Value -->
    <div class="mat-headline-2 metric-value">
      {{ displayValue() }} 
    </div>

    <!-- Label -->
    <div class="mat-body-2 metric-label">
      {{ displayLabel() }} 
    </div>

    <!-- Trend -->
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
  readonly titleOverride = input<string>(''); 

  /** Extracted Value for display. Handles multiple data shapes. */
  readonly displayValue: Signal<string | number> = computed(() => { 
    const d = this.data(); 
    if (d === null || d === undefined) return '-'; 
    if (typeof d !== 'object') return d; 

    // Shape: DuckDB Table Result
    if (Array.isArray(d.data) && d.data.length > 0) { 
      const firstRow = d.data[0]; 
      const keys = Object.keys(firstRow); 
      return keys.length > 0 ? firstRow[keys[0]] : '-'; 
    } 
    
    // Shape: Explicit Metric Object
    if ('value' in d) return d.value; 
    
    // Shape: Key-Value fallback
    const keys = Object.keys(d); 
    for (const k of keys) { 
        if (typeof d[k] === 'number') return d[k]; 
    } 
    return '-'; 
  }); 

  /** Extracted Label. Prioritizes Override -> Column Name -> Object Label property. */
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
}