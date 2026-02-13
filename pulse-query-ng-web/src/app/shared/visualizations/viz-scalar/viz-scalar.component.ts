import { Component, input, computed, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/**
 * Visualization: Scalar & Correlation Gauge.
 *
 * **Updates**:
 * - Replaced custom HTML gauge with `MatProgressBar`.
 * - Styles progress bar color based on correlation (Red=Neg, Green=Pos).
 */
@Component({
  selector: 'viz-scalar',
  imports: [CommonModule, MatTooltipModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        width: 100%;
        padding: 16px;
      }
      .value-display {
        font-size: 3rem;
        font-weight: 300;
        color: var(--sys-text-primary);
        line-height: 1;
        margin-bottom: 8px;
      }
      .label-display {
        font-size: 0.875rem;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
        letter-spacing: 1px;
        text-align: center;
      }

      .gauge-wrapper {
        width: 100%;
        max-width: 200px;
        margin-top: 16px;
        position: relative;
      }
      .interpret-text {
        margin-top: 8px;
        font-weight: 500;
        font-size: 0.75rem;
        color: var(--sys-text-secondary);
        text-align: center;
      }

      /* Dynamic Coloring for ProgressBar Track */
      ::ng-deep .gauge-pos .mdc-linear-progress__bar-inner {
        border-color: #4caf50 !important;
      }
      ::ng-deep .gauge-neg .mdc-linear-progress__bar-inner {
        border-color: #f44336 !important;
      }
      ::ng-deep .gauge-neutral .mdc-linear-progress__bar-inner {
        border-color: var(--sys-text-secondary) !important;
      }
    `,
  ],
  templateUrl: './viz-scalar.component.html',
})
export class VizScalarComponent {
  /** Data. */
  readonly data = input<any | null>();

  /** Extract numeric value from dataset. */
  readonly value: Signal<number | null> = computed(() => {
    const d = this.data();
    if (!d) return null;

    if (!Array.isArray(d.data) && typeof d.value === 'number') return d.value;

    if (Array.isArray(d.data) && d.data.length > 0) {
      const row = d.data[0];
      const valKey = Object.keys(row).find((k) => typeof row[k] === 'number');
      return valKey ? row[valKey] : null;
    }
    return null;
  });

  /** Formatted Value. */
  readonly formattedValue = computed(() => {
    const v = this.value();
    if (v === null) return '-';
    if (Math.abs(v) <= 1) return v.toFixed(2);
    return v.toLocaleString();
  });

  /** Label. */
  readonly label = computed(() => {
    const d = this.data();
    if (d?.columns && d.columns.length > 0)
      return d.columns.find((c: string) => c !== 'value') || d.columns[0];
    return 'Result';
  });

  /** Detect if metric is a correlation coefficient (-1 to 1). */
  readonly isCorrelation = computed(() => {
    const v = this.value();
    const l = this.label().toLowerCase();
    if (
      l.includes('correlation') ||
      l.includes('coef') ||
      l.includes('prob') ||
      l.includes('risk')
    ) {
      return v !== null && v >= -1 && v <= 1;
    }
    return false;
  });

  /**
   * Maps -1...1 to 0...100 for ProgressBar.
   * -1 => 0%
   * 0 => 50%
   * 1 => 100%
   */
  readonly gaugePosition = computed(() => {
    const v = this.value() || 0;
    return ((v + 1) / 2) * 100;
  });

  /** Determines color class for ProgressBar styling. */
  readonly colorClass = computed(() => {
    const v = this.value() || 0;
    if (Math.abs(v) < 0.3) return 'gauge-neutral';
    return v > 0 ? 'gauge-pos' : 'gauge-neg';
  });

  /** Strength Label. */
  readonly strengthLabel = computed(() => {
    const v = this.value() || 0;
    const abs = Math.abs(v);
    if (abs < 0.3) return 'Weak / No Correlation';
    if (abs < 0.7) return 'Moderate Correlation';
    return 'Strong Correlation';
  });

  /** Strength Color. */
  readonly strengthColor = computed(() => {
    const v = this.value() || 0;
    if (Math.abs(v) < 0.3) return 'var(--sys-text-secondary)';
    return v > 0 ? '#4caf50' : '#f44336';
  });
}
