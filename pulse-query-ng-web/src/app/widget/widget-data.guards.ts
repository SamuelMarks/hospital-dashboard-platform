/**
 * @fileoverview Runtime type-guard and narrowing parsers for dashboard widget datasets
 * (`TableDataSet`, `MetricData`, `ScalarData`, `ChartConfig`, `TypedWidgetConfig`).
 */

import { TableDataSet } from '../shared/visualizations/viz-table/viz-table.component';
import { MetricData } from '../shared/visualizations/viz-metric/viz-metric.component';
import { ScalarData } from '../shared/visualizations/viz-scalar/viz-scalar.component';
import {
  ChartConfig,
  ChartReferenceLine,
} from '../shared/visualizations/viz-chart/viz-chart.component';

/**
 * Strongly typed SQL widget configuration variant.
 */
export interface SqlWidgetConfig {
  /** Discriminant widget source kind. */
  readonly kind: 'SQL';
  /** DuckDB SQL query string. */
  readonly query: string;
  /** Whether interactive natural-text / LLM query execution is enabled on the card. */
  readonly allowNaturalText: boolean;
  /** Configured LLM processor identifier (`'SQL'` or `'provider:model'`). */
  readonly processor: string;
  /** Optional saved natural-language prompt. */
  readonly naturalTextPrompt: string;
  /** Optional custom input placeholder string. */
  readonly placeholderText: string | null;
  /** Optional template UUID when instantiated from a template. */
  readonly templateId: string | null;
}

/**
 * Strongly typed HTTP widget configuration variant.
 */
export interface HttpWidgetConfig {
  /** Discriminant widget source kind. */
  readonly kind: 'HTTP';
  /** Target HTTP endpoint URL. */
  readonly url: string;
  /** HTTP request method (`'GET'`, `'POST'`, etc.). */
  readonly method: string;
}

/**
 * Strongly typed Markdown/Text widget configuration variant.
 */
export interface TextWidgetConfig {
  /** Discriminant widget source kind. */
  readonly kind: 'TEXT';
  /** Markdown text body. */
  readonly content: string;
}

/**
 * Discriminated union of all strongly typed widget configurations.
 */
export type TypedWidgetConfig = SqlWidgetConfig | HttpWidgetConfig | TextWidgetConfig;

/**
 * Parses a raw widget configuration record into a strongly typed `SqlWidgetConfig`.
 *
 * @param config - Raw widget configuration record.
 * @returns Strongly typed `SqlWidgetConfig` value.
 */
export function parseSqlWidgetConfig(
  config: Record<string, unknown> | null | undefined,
): SqlWidgetConfig {
  const safeConfig = config ?? {};
  const rawProcessor = safeConfig['processor'];
  const rawPlaceholder = safeConfig['placeholder_text'];
  const rawTemplateId = safeConfig['template_id'];

  return {
    kind: 'SQL',
    query: typeof safeConfig['query'] === 'string' ? safeConfig['query'] : '',
    allowNaturalText: Boolean(safeConfig['allow_natural_text']),
    processor: typeof rawProcessor === 'string' && rawProcessor.length > 0 ? rawProcessor : 'SQL',
    naturalTextPrompt:
      typeof safeConfig['natural_text_prompt'] === 'string'
        ? safeConfig['natural_text_prompt']
        : '',
    placeholderText:
      typeof rawPlaceholder === 'string' && rawPlaceholder.trim().length > 0
        ? rawPlaceholder
        : null,
    templateId:
      typeof rawTemplateId === 'string' && rawTemplateId.length > 0 ? rawTemplateId : null,
  };
}

/**
 * Parses a raw widget `type` and `config` record into a strongly typed `TypedWidgetConfig` discriminated union.
 *
 * @param widgetType - Raw widget type string (`'SQL'`, `'HTTP'`, `'TEXT'`, or `'TEMPLATE'`).
 * @param config - Raw widget configuration record.
 * @returns Strongly typed `TypedWidgetConfig` union value.
 */
export function parseTypedWidgetConfig(
  widgetType: string | null | undefined,
  config: Record<string, unknown> | null | undefined,
): TypedWidgetConfig {
  const normalizedType = (widgetType || 'SQL').toUpperCase();
  const safeConfig = config ?? {};

  if (normalizedType === 'TEXT') {
    return {
      kind: 'TEXT',
      content: typeof safeConfig['content'] === 'string' ? safeConfig['content'] : '',
    };
  }

  if (normalizedType === 'HTTP') {
    return {
      kind: 'HTTP',
      url: typeof safeConfig['url'] === 'string' ? safeConfig['url'] : '',
      method: typeof safeConfig['method'] === 'string' ? safeConfig['method'] : 'GET',
    };
  }

  return parseSqlWidgetConfig(safeConfig);
}

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
