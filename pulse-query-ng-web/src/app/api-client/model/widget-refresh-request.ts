/**
 * @fileoverview Generated OpenAPI model interface for Hospital Analytics Platform.
 */

/**
 * Strongly typed request payload for refreshing a single widget (`POST /dashboards/{id}/widgets/{wid}/refresh`).
 */
export interface WidgetRefreshRequest {
  /** Optional global dashboard filter parameters dictionary. */
  global_params?: Record<string, unknown> | null;
  /** Optional user-entered natural language prompt or raw SQL query. */
  natural_text?: string | null;
  /** Optional processor override ('SQL', 'ollama:<model>', or '<provider>:<model>'). */
  processor?: string | null;
  /** Optional clinical department filter. */
  dept?: string | null;
  /** Optional department filter. */
  department?: string | null;
  /** Optional clinical service filter. */
  service?: string | null;
  /** Optional start date filter (YYYY-MM-DD). */
  start_date?: string | null;
  /** Optional end date filter (YYYY-MM-DD). */
  end_date?: string | null;
  /** Optional hospital unit filter. */
  unit?: string | null;
  /** Additional global filter parameters. */
  [key: string]: unknown;
}
