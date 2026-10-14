/**
 * @fileoverview Strongly typed execution result and configuration models for dashboard widgets.
 */

/**
 * Execution payload returned for a `SQL` widget.
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
 * Union of widget execution payloads stored in `DashboardStore.dataMap`.
 */
export type WidgetExecutionPayload =
  SqlWidgetData | HttpWidgetData | Record<string, unknown> | undefined;
