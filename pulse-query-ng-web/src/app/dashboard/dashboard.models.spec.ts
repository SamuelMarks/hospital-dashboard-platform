/**
 * @fileoverview Unit tests for `dashboard.models.ts` type-safe payload extractors.
 */

import { describe, expect, it } from 'vitest';
import {
  extractWidgetColumns,
  extractWidgetExecutionPayload,
  parseDashboardExecutionMap,
} from './dashboard.models';

describe('dashboard.models', () => {
  it('extractWidgetColumns returns string columns or empty array for missing/non-array payloads', () => {
    expect(extractWidgetColumns(undefined)).toEqual([]);
    expect(extractWidgetColumns({ status: 'success', data: null })).toEqual([]);
    expect(extractWidgetColumns({ columns: 'not-an-array' })).toEqual([]);
    const mixedColumns: unknown[] = ['unit', 'census', 123];
    expect(extractWidgetColumns({ columns: mixedColumns })).toEqual(['unit', 'census']);
  });

  it('parseDashboardExecutionMap and extractWidgetExecutionPayload safely narrow raw responses', () => {
    expect(parseDashboardExecutionMap(null)).toEqual({});
    expect(parseDashboardExecutionMap(undefined)).toEqual({});
    expect(parseDashboardExecutionMap([1, 2, 3])).toEqual({});

    const map = parseDashboardExecutionMap({
      w1: { columns: ['a'], data: [{ a: 1 }] },
      w2: [1, 2],
      w3: undefined,
    });
    expect(map['w1']).toEqual({ columns: ['a'], data: [{ a: 1 }] });
    expect(map['w2']).toEqual([1, 2]);
    expect(map['w3']).toBeUndefined();

    expect(extractWidgetExecutionPayload({ w1: { status: 'success', data: null } }, 'w1')).toEqual({
      status: 'success',
      data: null,
    });
    expect(extractWidgetExecutionPayload(null, 'w1')).toBeUndefined();
  });
});
