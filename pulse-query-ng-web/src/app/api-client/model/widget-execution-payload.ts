/**
 * @fileoverview Generated OpenAPI model interfaces for discriminated widget execution payloads.
 */

/**
 * Strongly typed OpenAPI model for a SQL widget execution payload.
 */
export interface SqlExecutionPayload {
  /** Discriminator tag identifying a SQL widget execution payload. */
  kind?: 'sql';
  /** List of row dictionaries returned by DuckDB. */
  data: Record<string, unknown>[];
  /** Ordered list of column names. */
  columns: string[];
  /** Error message if SQL execution failed, else null. */
  error?: string | null;
  /** Optional generated or executed SQL string. */
  generated_sql?: string | null;
  /** Optional processor identifier used. */
  processor_used?: string | null;
  /** Optional natural language input processed. */
  natural_text?: string | null;
}

/**
 * Strongly typed OpenAPI model for an HTTP widget execution payload.
 */
export interface HttpExecutionPayload {
  /** Discriminator tag identifying an HTTP widget execution payload. */
  kind?: 'http';
  /** Parsed JSON or raw text payload returned by the target HTTP endpoint. */
  data?: unknown;
  /** HTTP status code or status label. */
  status: number | string;
  /** Error message if the HTTP request failed, else null. */
  error?: string | null;
}

/**
 * Strongly typed OpenAPI model for a static TEXT/Markdown widget execution payload.
 */
export interface TextExecutionPayload {
  /** Discriminator tag identifying a static text widget payload. */
  kind?: 'text';
  /** Fixed success status string. */
  status: 'success';
  /** Always null for static text widgets. */
  data: null;
  /** Always null for static text widgets. */
  error?: string | null;
}

/**
 * Strongly typed OpenAPI model for a widget execution error payload.
 */
export interface ErrorExecutionPayload {
  /** Discriminator tag identifying an execution error payload. */
  kind?: 'error';
  /** Human-readable execution error message. */
  error: string;
  /** Optional empty data array for client compatibility. */
  data?: Record<string, unknown>[] | unknown;
  /** Optional empty columns array for client compatibility. */
  columns?: string[] | null;
  /** Optional generated SQL snippet if available. */
  generated_sql?: string | null;
  /** Optional processor identifier used. */
  processor_used?: string | null;
  /** Optional natural language input processed. */
  natural_text?: string | null;
}

/**
 * Discriminated union of all strongly typed widget execution payload models.
 */
export type WidgetExecutionPayload =
  SqlExecutionPayload | HttpExecutionPayload | TextExecutionPayload | ErrorExecutionPayload;
