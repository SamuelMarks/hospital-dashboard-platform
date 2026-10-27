/**
 * @fileoverview Unit tests for `viz-axis-inference.utils.ts`.
 */

import { describe, expect, it } from 'vitest';
import { inferChartAxisKeys, inferPieSliceKeys } from './viz-axis-inference.utils';

describe('viz-axis-inference.utils', () => {
  it('inferChartAxisKeys handles empty columns and empty firstRow', () => {
    expect(inferChartAxisKeys([], {})).toEqual({ x: '', y: '', stack: '' });
    expect(inferChartAxisKeys(undefined, {})).toEqual({ x: '', y: '', stack: '' });
  });

  it('inferChartAxisKeys infers string X, numeric Y, and optional 3rd string stack column', () => {
    const row = { unit: 'ICU', service: 'Cardiology', census: 14 };
    expect(inferChartAxisKeys(['unit', 'service', 'census'], row)).toEqual({
      x: 'unit',
      y: 'census',
      stack: 'service',
    });

    expect(
      inferChartAxisKeys(['unit', 'service', 'census'], row, {
        xKey: 'service',
        yKey: 'census',
        stackBy: 'unit',
      }),
    ).toEqual({
      x: 'service',
      y: 'census',
      stack: 'unit',
    });
  });

  it('inferChartAxisKeys falls back to first column when single non-string/non-numeric column exists', () => {
    const row = { flag: true };
    expect(inferChartAxisKeys(undefined, row)).toEqual({
      x: 'flag',
      y: 'flag',
      stack: '',
    });

    const threeNumRow = { a: 1, b: 2, c: 3 };
    expect(inferChartAxisKeys(['a', 'b', 'c'], threeNumRow)).toEqual({
      x: 'a',
      y: 'a',
      stack: '',
    });
  });

  it('inferPieSliceKeys resolves default and validated override keys', () => {
    const row = { unit: 'ICU', label2: 'sub', count: 10 };
    expect(inferPieSliceKeys(['unit', 'label2', 'count'], row)).toEqual({
      labelKey: 'unit',
      valueKey: 'count',
    });

    expect(
      inferPieSliceKeys(['unit', 'label2', 'count'], row, { xKey: 'label2', yKey: 'count' }),
    ).toEqual({
      labelKey: 'label2',
      valueKey: 'count',
    });

    expect(
      inferPieSliceKeys(['only_col'], { only_col: 'A' }, { xKey: 'missing', yKey: 'missing' }),
    ).toEqual({
      labelKey: 'only_col',
      valueKey: 'only_col',
    });
  });
});
