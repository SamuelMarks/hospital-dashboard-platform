/**
 * @fileoverview Pure, stateless grid layout and bin-packing utilities for dashboard widgets.
 */

import { HttpConfig, SqlConfig, TextConfig, WidgetResponse } from '../api-client';

/**
 * Sorts widgets in ascending order by their `config.order` numeric property.
 *
 * @param widgets - Read-only array of widgets to sort.
 * @returns New array of widgets sorted by `config['order']`.
 */
export function sortWidgetsByOrder(widgets: readonly WidgetResponse[]): WidgetResponse[] {
  return [...widgets].sort((a, b) => {
    const rawA = a.config?.['order'];
    const rawB = b.config?.['order'];
    const orderA = typeof rawA === 'number' ? rawA : 0;
    const orderB = typeof rawB === 'number' ? rawB : 0;
    return orderA - orderB;
  });
}

/**
 * Checks whether a candidate grid rectangle `(x, y, w, h)` overlaps any existing widget.
 *
 * @param x - Candidate zero-based column index.
 * @param y - Candidate zero-based row index.
 * @param w - Candidate column width span.
 * @param h - Candidate row height span.
 * @param widgets - Existing widgets on the dashboard.
 * @returns `true` if the candidate rectangle collides with any existing widget.
 */
export function hasGridCollision(
  x: number,
  y: number,
  w: number,
  h: number,
  widgets: readonly WidgetResponse[],
): boolean {
  for (const widget of widgets) {
    const wx = Number(widget.config?.['x'] ?? 0);
    const wy = Number(widget.config?.['y'] ?? 0);
    const ww = Math.max(1, Number(widget.config?.['w'] ?? 6));
    const wh = Math.max(1, Number(widget.config?.['h'] ?? 4));

    const overlapsX = x < wx + ww && x + w > wx;
    const overlapsY = y < wy + wh && y + h > wy;
    if (overlapsX && overlapsY) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the first non-overlapping `(x, y)` grid slot that fits a widget of size `(width, height)`.
 *
 * @param widgets - Existing widgets on the dashboard.
 * @param width - Desired column span (defaults to `6`).
 * @param height - Desired row span (defaults to `4`).
 * @param gridCols - Total number of columns in the dashboard grid (defaults to `12`).
 * @returns First available `{ x, y }` coordinates.
 */
export function findFirstAvailableSlot(
  widgets: readonly WidgetResponse[],
  width = 6,
  height = 4,
  gridCols = 12,
): { x: number; y: number } {
  const clampedWidth = Math.max(1, Math.min(gridCols, width));
  const clampedHeight = Math.max(1, height);

  let y = 0;
  while (y < 1000) {
    for (let x = 0; x <= gridCols - clampedWidth; x++) {
      if (!hasGridCollision(x, y, clampedWidth, clampedHeight, widgets)) {
        return { x, y };
      }
    }
    y++;
  }
  return { x: 0, y };
}

/**
 * Clones a widget configuration object and offsets its `(x, y)` coordinates for duplication.
 *
 * @param config - Source widget configuration dictionary.
 * @param maxColIndex - Maximum allowed zero-based column index (defaults to `11`).
 * @returns Cloned configuration dictionary with offset `x` and `y` coordinates.
 */
export function offsetWidgetCoordinates(
  config: Record<string, unknown>,
  maxColIndex = 11,
): Record<string, unknown> {
  const newConfig = structuredClone(config);
  const rawX = newConfig['x'];
  const rawY = newConfig['y'];
  const currentX = typeof rawX === 'number' ? rawX : 0;
  const currentY = typeof rawY === 'number' ? rawY : 0;

  newConfig['x'] = Math.min(maxColIndex, currentX + 1);
  newConfig['y'] = currentY + 1;
  return newConfig;
}

/**
 * Interpolates `{{param}}` placeholders in a SQL template string with values from `params`.
 *
 * @param sqlTemplate - SQL template string containing `{{key}}` placeholders.
 * @param params - Key-value map of parameter values to substitute.
 * @returns Interpolated SQL query string.
 */
export function interpolateSqlTemplate(
  sqlTemplate: string,
  params: Readonly<Record<string, unknown>>,
): string {
  let sql = sqlTemplate;
  for (const key of Object.keys(params)) {
    const val = params[key];
    sql = sql.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(val));
  }
  return sql;
}

/**
 * Constructs a strongly-typed `HttpConfig` object from a raw widget configuration dictionary.
 *
 * @param config - Raw widget configuration map.
 * @returns Strictly typed `HttpConfig` payload.
 */
export function buildHttpWidgetConfig(config: Record<string, unknown>): HttpConfig {
  return {
    ...config,
    url: typeof config['url'] === 'string' ? config['url'] : '',
  };
}

/**
 * Constructs a strongly-typed `TextConfig` object from a raw widget configuration dictionary.
 *
 * @param config - Raw widget configuration map.
 * @returns Strictly typed `TextConfig` payload.
 */
export function buildTextWidgetConfig(config: Record<string, unknown>): TextConfig {
  return {
    ...config,
    content: typeof config['content'] === 'string' ? config['content'] : '',
  };
}

/**
 * Constructs a strongly-typed `SqlConfig` object from a raw widget configuration dictionary.
 *
 * @param config - Raw widget configuration map.
 * @returns Strictly typed `SqlConfig` payload.
 */
export function buildSqlWidgetConfig(config: Record<string, unknown>): SqlConfig {
  return {
    ...config,
    query: typeof config['query'] === 'string' ? config['query'] : '',
  };
}
