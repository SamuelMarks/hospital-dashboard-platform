/**
 * @fileoverview Unit tests for `dashboard-grid-layout.utils.ts`.
 */

import {
  findFirstAvailableSlot,
  hasGridCollision,
  offsetWidgetCoordinates,
  sortWidgetsByOrder,
} from './dashboard-grid-layout.utils';
import { WidgetResponse } from '../api-client';

function makeWidget(id: string, config: Record<string, unknown>): WidgetResponse {
  return {
    id,
    dashboard_id: 'd1',
    title: id,
    type: 'SQL',
    visualization: 'table',
    config,
  };
}

describe('dashboard-grid-layout.utils', () => {
  it('sorts widgets by config.order with fallback to 0', () => {
    const w1 = makeWidget('w1', { order: 3 });
    const w2 = makeWidget('w2', {});
    const w3 = makeWidget('w3', { order: 1 });

    const sorted = sortWidgetsByOrder([w1, w2, w3]);
    expect(sorted.map((w) => w.id)).toEqual(['w2', 'w3', 'w1']);
  });

  it('detects grid collisions accurately', () => {
    const existing = [
      makeWidget('w1', { x: 0, y: 0, w: 6, h: 4 }),
      makeWidget('w2', {}), // defaults to x=0, y=0, w=6, h=4
    ];

    expect(hasGridCollision(0, 0, 6, 4, existing)).toBe(true);
    expect(hasGridCollision(5, 3, 2, 2, existing)).toBe(true);
    expect(hasGridCollision(6, 0, 6, 4, existing)).toBe(false);
    expect(hasGridCollision(0, 4, 6, 4, existing)).toBe(false);
  });

  it('finds the first available slot on empty and partially occupied grids', () => {
    expect(findFirstAvailableSlot([])).toEqual({ x: 0, y: 0 });

    const firstHalf = [makeWidget('w1', { x: 0, y: 0, w: 6, h: 4 })];
    expect(findFirstAvailableSlot(firstHalf, 6, 4)).toEqual({ x: 6, y: 0 });

    const fullFirstRow = [
      makeWidget('w1', { x: 0, y: 0, w: 6, h: 4 }),
      makeWidget('w2', { x: 6, y: 0, w: 6, h: 4 }),
    ];
    expect(findFirstAvailableSlot(fullFirstRow, 6, 4)).toEqual({ x: 0, y: 4 });
  });

  it('returns fallback row 1000 when all 1000 rows are occupied', () => {
    const giantBlocker = [makeWidget('giant', { x: 0, y: 0, w: 12, h: 1005 })];
    expect(findFirstAvailableSlot(giantBlocker, 6, 4, 12)).toEqual({ x: 0, y: 1000 });
  });

  it('offsets widget coordinates and clamps x to maxColIndex', () => {
    expect(offsetWidgetCoordinates({ x: 2, y: 3, query: 'SELECT 1' })).toEqual({
      x: 3,
      y: 4,
      query: 'SELECT 1',
    });
    expect(offsetWidgetCoordinates({})).toEqual({ x: 1, y: 1 });
    expect(offsetWidgetCoordinates({ x: 11, y: 0 })).toEqual({ x: 11, y: 1 });
  });
});
