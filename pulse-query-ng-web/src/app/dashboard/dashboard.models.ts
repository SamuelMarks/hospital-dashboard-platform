/**
 * Execution payload returned for a `SQL` widget.
 *
 * @fileoverview Strongly typed execution result and configuration models for dashboard widgets.
 */
export interface SqlWidgetData {
  /** Tabular row objects keyed by column name. */
  data?: Record<string, unknown>[];
  /** Ordered column names returned by the DuckDB query. */
  columns?: string[];
  /** Optional error message if SQL execution failed. */
  error?: string | null;
  /** Additional metadata fields. */
  [key: string]: unknown;
}

/**
 * Scalar primitive value allowed in SQL parameters and tabular cells.
 */
export type SqlScalarValue = string | number | boolean | null;

/**
 * Execution payload returned for an `HTTP` widget.
 */
export interface HttpWidgetData {
  /** Parsed JSON or raw payload returned by the HTTP endpoint. */
  data?: unknown;
  /** HTTP status code returned by the upstream server. */
  status?: number;
  /** Optional error message if the HTTP request failed. */
  error?: string | null;
  /** Additional metadata fields. */
  [key: string]: unknown;
}

/**
 * Configuration dictionary for a `TEXT` (Markdown) widget.
 */
export interface TextWidgetConfig {
  /** Markdown content string. */
  content?: string;
  /** Optional grid column coordinate. */
  x?: number;
  /** Optional grid row coordinate. */
  y?: number;
  /** Optional grid column span. */
  w?: number;
  /** Optional grid row span. */
  h?: number;
  /** Additional configuration properties. */
  [key: string]: unknown;
}

/**
 * Execution payload returned for a `TEXT` (Markdown) widget.
 */
export interface TextWidgetData {
  /** Execution status string (`'success'`). */
  status: 'success';
  /** Null data payload for static text widgets. */
  data: null;
  /** Optional error field. */
  error?: undefined;
  /** Additional metadata fields. */
  [key: string]: unknown;
}

/**
 * Execution payload returned when a widget refresh fails.
 */
export interface ErrorWidgetData {
  /** Human-readable error message. */
  error: string;
  /** Optional empty data fallback. */
  data?: unknown;
  /** Optional column list fallback. */
  columns?: string[];
  /** Additional metadata fields. */
  [key: string]: unknown;
}

/**
 * Global filter parameters injected into SQL widgets (`department`, `date_range`, `time_range`, etc.).
 */
export interface GlobalFilterParams {
  /** Selected clinical department or service filter. */
  readonly department?: string;
  /** Selected date range filter string. */
  readonly date_range?: string;
  /** Selected time range filter string. */
  readonly time_range?: string;
  /** Additional global filter parameter entries. */
  readonly [key: string]: unknown;
}

/**
 * Strongly typed layout patch applied when resizing, moving, or reordering a widget on the grid.
 */
export interface WidgetLayoutPatch {
  /** Zero-based grid column coordinate. */
  readonly x?: number;
  /** Zero-based grid row coordinate. */
  readonly y?: number;
  /** Grid column span width. */
  readonly w?: number;
  /** Grid row span height. */
  readonly h?: number;
  /** Sort order index within the dashboard. */
  readonly order?: number;
  /** Optional group name. */
  readonly group?: string;
  /** Additional widget configuration properties. */
  readonly [key: string]: unknown;
}

/**
 * Union of widget execution payloads stored in `DashboardStore.dataMap`.
 */
export type WidgetExecutionPayload =
  | SqlWidgetData
  | HttpWidgetData
  | TextWidgetData
  | ErrorWidgetData
  | Record<string, unknown>
  | undefined;

/**
 * Runtime type-guard parser converting an untyped dashboard refresh response into `Record<string, WidgetExecutionPayload>`.
 *
 * @param raw - Raw API response from dashboard refresh endpoint.
 * @returns Validated map of widget IDs to `WidgetExecutionPayload` values.
 */
export function parseDashboardExecutionMap(raw: unknown): Record<string, WidgetExecutionPayload> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  const parsed: Record<string, WidgetExecutionPayload> = {};
  for (const [key, val] of entries) {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      parsed[key] = { ...(val as Record<string, unknown>) };
    } else if (val === undefined) {
      parsed[key] = undefined;
    } else {
      parsed[key] = val as WidgetExecutionPayload;
    }
  }
  return parsed;
}

/**
 * Safely extracts a single widget's execution payload by `widgetId` from a raw refresh response.
 *
 * @param raw - Raw API response from single-widget refresh endpoint.
 * @param widgetId - Target widget UUID key.
 * @returns Extracted `WidgetExecutionPayload` for `widgetId`, or `undefined`.
 */
export function extractWidgetExecutionPayload(
  raw: unknown,
  widgetId: string,
): WidgetExecutionPayload {
  const map = parseDashboardExecutionMap(raw);
  return map[widgetId];
}

/**
 * Safely extracts the ordered column names array from a `WidgetExecutionPayload` without unsafe casts.
 *
 * @param payload - Widget execution result payload from `DashboardStore.dataMap`.
 * @returns Array of string column names, or an empty array when unavailable.
 */
export function extractWidgetColumns(payload: WidgetExecutionPayload): string[] {
  if (!payload || typeof payload !== 'object' || !('columns' in payload)) {
    return [];
  }
  const cols = payload['columns'];
  if (!Array.isArray(cols)) {
    return [];
  }
  return cols.filter((c): c is string => typeof c === 'string');
}
