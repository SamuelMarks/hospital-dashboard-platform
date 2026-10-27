/**
 * @fileoverview Runtime type-guard and narrowing parsers for dashboard widget datasets
 * (`TableDataSet`, `MetricData`, `ScalarData`, `ChartConfig`).
 */

import { TableDataSet } from '../shared/visualizations/viz-table/viz-table.component';
import { MetricData } from '../shared/visualizations/viz-metric/viz-metric.component';
import { ScalarData } from '../shared/visualizations/viz-scalar/viz-scalar.component';
import {
  ChartConfig,
  ChartReferenceLine,
} from '../shared/visualizations/viz-chart/viz-chart.component';

/**
 * Safely narrows an arbitrary `unknown` value into `Record<string, unknown> | null`.
 *
 * @param raw - Candidate value from `DashboardStore.dataMap`.
 * @returns `Record<string, unknown>` if `raw` is a non-null, non-array object; otherwise `null`.
 */
export function narrowRecordPayload(raw: unknown): Record<string, unknown> | null {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * Safely extracts an execution error string from a raw widget result payload.
 *
 * @param raw - Raw execution result payload.
 * @returns Non-empty error message string, or `null` when healthy.
 */
export function extractExecutionErrorMessage(
  raw: Record<string, unknown> | null | undefined,
): string | null {
  if (!raw) {
    return null;
  }
  const errVal = raw['error'];
  return typeof errVal === 'string' && errVal.length > 0 ? errVal : null;
}

/**
 * Safely extracts the Markdown `content` string from a widget's configuration dictionary.
 *
 * @param config - Raw widget configuration dictionary.
 * @returns Markdown string if present, or `undefined` otherwise.
 */
export function extractMarkdownContent(
  config: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!config) {
    return undefined;
  }
  const content = config['content'];
  return typeof content === 'string' ? content : undefined;
}

/**
 * Safely extracts tabular row records (`Record<string, unknown>[]`) from a widget execution payload for CSV export.
 *
 * @param raw - Raw execution result dictionary.
 * @returns Array of row objects (empty array when `data` is missing or not an array).
 */
export function extractTabularExportRows(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  if (!raw || !Array.isArray(raw['data'])) {
    return [];
  }
  return raw['data'].filter(
    (row): row is Record<string, unknown> =>
      row !== null && typeof row === 'object' && !Array.isArray(row),
  );
}

/**
 * Narrowing parser converting a raw execution result dictionary into a `TableDataSet | null`.
 *
 * @param raw - Raw execution result dictionary or null/undefined.
 * @returns Validated `TableDataSet` when `raw` is a non-null record, or `null` otherwise.
 */
export function parseTableDataSet(
  raw: Record<string, unknown> | null | undefined,
): TableDataSet | null {
  if (!raw) {
    return null;
  }
  const columns = Array.isArray(raw['columns'])
    ? raw['columns'].filter((c): c is string => typeof c === 'string')
    : [];
  const data = Array.isArray(raw['data'])
    ? raw['data'].filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    : [];
  return { columns, data };
}

/**
 * Narrowing parser converting a raw execution result dictionary into `MetricData | undefined`.
 *
 * @param raw - Raw execution result dictionary or null/undefined.
 * @returns Validated `MetricData` object, or `undefined` when `raw` is null/undefined.
 */
export function parseMetricData(
  raw: Record<string, unknown> | null | undefined,
): MetricData | undefined {
  if (!raw) {
    return undefined;
  }
  const result: MetricData = { ...raw };
  if (typeof raw['value'] === 'number' || typeof raw['value'] === 'string') {
    result.value = raw['value'];
  }
  if (typeof raw['label'] === 'string') {
    result.label = raw['label'];
  }
  if (typeof raw['trend'] === 'number') {
    result.trend = raw['trend'];
  }
  if (Array.isArray(raw['trend_data'])) {
    result.trend_data = raw['trend_data'].filter((n): n is number => typeof n === 'number');
  }
  return result;
}

/**
 * Narrowing parser converting a raw execution result dictionary into `ScalarData | undefined`.
 *
 * @param raw - Raw execution result dictionary or null/undefined.
 * @returns Validated `ScalarData` object, or `undefined` when `raw` is null/undefined.
 */
export function parseScalarData(
  raw: Record<string, unknown> | null | undefined,
): ScalarData | undefined {
  if (!raw) {
    return undefined;
  }
  const result: ScalarData = { ...raw };
  if (typeof raw['value'] === 'number') {
    result.value = raw['value'];
  }
  return result;
}

/**
 * Narrowing parser converting a raw widget configuration dictionary into a typed `ChartConfig`.
 *
 * @param config - Raw widget configuration dictionary or null/undefined.
 * @returns Validated `ChartConfig` object.
 */
export function parseChartConfig(config: Record<string, unknown> | null | undefined): ChartConfig {
  if (!config) {
    return {};
  }
  const parsed: ChartConfig = {};
  if (typeof config['xKey'] === 'string') {
    parsed.xKey = config['xKey'];
  }
  if (typeof config['yKey'] === 'string') {
    parsed.yKey = config['yKey'];
  }
  if (typeof config['stackBy'] === 'string') {
    parsed.stackBy = config['stackBy'];
  }
  if (Array.isArray(config['referenceLines'])) {
    const rawLines: unknown[] = config['referenceLines'];
    const lines: ChartReferenceLine[] = [];
    for (const item of rawLines) {
      if (typeof item === 'object' && item !== null && 'y' in item && typeof item.y === 'number') {
        const line: ChartReferenceLine = { y: item.y };
        if ('label' in item && typeof item.label === 'string') {
          line.label = item.label;
        }
        if ('color' in item && typeof item.color === 'string') {
          line.color = item.color;
        }
        if (
          'style' in item &&
          (item.style === 'solid' || item.style === 'dashed' || item.style === 'dotted')
        ) {
          line.style = item.style;
        }
        lines.push(line);
      }
    }
    parsed.referenceLines = lines;
  }
  return parsed;
}
