/**
 * @fileoverview Single-scalar and correlation coefficient gauge visualization component.
 */

import { Component, input, computed, Signal, inject, LOCALE_ID } from '@angular/core';
import { formatNumber } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/**
 * Input data payload accepted by `VizScalarComponent`.
 */
export interface ScalarData {
  /** Direct numeric scalar value when provided outside a tabular row set. */
  value?: number;
  /** Optional array of tabular result rows containing a numeric column. */
  data?: Record<string, unknown>[];
  /** Optional list of column names corresponding to `data`. */
  columns?: string[];
  [key: string]: unknown;
}

/**
 * Renders a prominent scalar number and, when the column represents a correlation or probability,
 * a linear progress bar gauge with qualitative strength interpretation.
 */
@Component({
  selector: 'viz-scalar',
  imports: [MatTooltipModule, MatProgressBarModule],

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
      .gauge-pos {
        --mdc-linear-progress-active-indicator-color: var(--sys-success);
      }
      .gauge-neg {
        --mdc-linear-progress-active-indicator-color: var(--sys-error);
      }
      .gauge-neutral {
        --mdc-linear-progress-active-indicator-color: var(--sys-text-secondary);
      }
    `,
  ],
  templateUrl: './viz-scalar.component.html',
})
export class VizScalarComponent {
  /** Injected application locale identifier. */
  private readonly localeId = inject(LOCALE_ID);
  /** Scalar or single-row tabular dataset to display. */
  readonly data = input<ScalarData | null>();

  /** Computed numeric scalar value extracted from `data`, or `null` if unavailable. */
  readonly value: Signal<number | null> = computed(() => {
    const d = this.data();
    if (!d) return null;
    if (Array.isArray(d.data)) {
      if (d.data.length > 0) {
        const row = d.data[0] as Record<string, unknown>;
        const valKey = Object.keys(row).find((k) => typeof row[k] === 'number');
        return valKey ? (row[valKey] as number) : null;
      }
      return null;
    }
    if (typeof d.value === 'number') return d.value;
    return null;
  });

  /** Computed formatted string representation of `value` (2 decimals for unit-interval values, locale string otherwise). */
  readonly formattedValue = computed(() => {
    const v = this.value();
    if (v === null) return '-';
    if (Math.abs(v) <= 1) return formatNumber(v, this.localeId, '1.2-2');
    return formatNumber(v, this.localeId);
  });

  /** Computed uppercase label derived from the dataset's primary column name. */
  readonly label = computed(() => {
    const d = this.data();
    if (d?.columns && d.columns.length > 0)
      return d.columns.find((c: string) => c !== 'value') || (d.columns[0] as string);
    return $localize`Result`;
  });

  /** Computed flag indicating whether the scalar represents a correlation or probability in `[-1, 1]`. */
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

  /** Computed 0-100 percentage position mapping a `[-1, 1]` correlation value onto the progress bar. */
  readonly gaugePosition = computed(() => {
    const v = this.value() || 0;
    return ((v + 1) / 2) * 100;
  });

  /** Computed CSS modifier class coloring the progress gauge positive, negative, or neutral. */
  readonly colorClass = computed(() => {
    const v = this.value() || 0;
    if (Math.abs(v) < 0.3) return 'gauge-neutral';
    return v > 0 ? 'gauge-pos' : 'gauge-neg';
  });

  /** Computed qualitative description of correlation magnitude (Weak, Moderate, or Strong). */
  readonly strengthLabel = computed(() => {
    const v = this.value() || 0;
    const abs = Math.abs(v);
    if (abs < 0.3) return $localize`Weak / No Correlation`;
    if (abs < 0.7) return $localize`Moderate Correlation`;
    return $localize`Strong Correlation`;
  });

  /** Computed CSS color variable matching the sign and strength of the correlation. */
  readonly strengthColor = computed(() => {
    const v = this.value() || 0;
    if (Math.abs(v) < 0.3) return 'var(--sys-text-secondary)';
    return v > 0 ? 'var(--sys-success)' : 'var(--sys-error)';
  });
}
