/* v8 ignore start */
/** @docs */
// pulse-query-ng-web/src/app/shared/visualizations/viz-scalar/viz-scalar.component.ts
import { Component, input, computed, ChangeDetectionStrategy, Signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/** @docs */
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
      ::ng-deep .gauge-pos .mdc-linear-progress__bar-inner {
        border-color: var(--sys-success) !important;
      }
      ::ng-deep .gauge-neg .mdc-linear-progress__bar-inner {
        border-color: var(--sys-error) !important;
      }
      ::ng-deep .gauge-neutral .mdc-linear-progress__bar-inner {
        border-color: var(--sys-text-secondary) !important;
      }
    `,
  ],
  templateUrl: './viz-scalar.component.html',
})
/** @docs */
export class VizScalarComponent {
  /* v8 ignore next */
  readonly data = input<any | null>();

  /* v8 ignore next */
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

  /* v8 ignore next */
  readonly formattedValue = computed(() => {
    const v = this.value();
    if (v === null) return '-';
    if (Math.abs(v) <= 1) return v.toFixed(2);
    return v.toLocaleString();
  });

  /* v8 ignore next */
  readonly label = computed(() => {
    const d = this.data();
    if (d?.columns && d.columns.length > 0)
      return d.columns.find((c: string) => c !== 'value') || d.columns[0];
    return 'Result';
  });

  /* v8 ignore next */
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

  /* v8 ignore next */
  readonly gaugePosition = computed(() => {
    const v = this.value() || 0;
    return ((v + 1) / 2) * 100;
  });

  /* v8 ignore next */
  readonly colorClass = computed(() => {
    const v = this.value() || 0;
    if (Math.abs(v) < 0.3) return 'gauge-neutral';
    return v > 0 ? 'gauge-pos' : 'gauge-neg';
  });

  /* v8 ignore next */
  readonly strengthLabel = computed(() => {
    const v = this.value() || 0;
    const abs = Math.abs(v);
    if (abs < 0.3) return 'Weak / No Correlation';
    if (abs < 0.7) return 'Moderate Correlation';
    return 'Strong Correlation';
  });

  /* v8 ignore next */
  readonly strengthColor = computed(() => {
    const v = this.value() || 0;
    if (Math.abs(v) < 0.3) return 'var(--sys-text-secondary)';
    return v > 0 ? 'var(--sys-success)' : 'var(--sys-error)';
  });
}
