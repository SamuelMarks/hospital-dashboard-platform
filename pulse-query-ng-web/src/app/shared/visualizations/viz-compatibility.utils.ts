/**
 * @fileoverview Canonical visualization type normalization and SQL-to-visualization
 * applicability validation engine (`viz-compatibility.utils.ts`).
 *
 * Enforces structural compatibility between SQL query result schemas/domains
 * (`columns`, `data` rows, numeric vs. categorical types, and value ranges)
 * and dashboard visualization representations (`table`, `metric`, `scalar`,
 * `bar_chart`, `line_chart`, `pie_chart`, `heatmap`, `markdown`).
 */

import {
  AxisInferenceConfig,
  inferChartAxisKeys,
  inferPieSliceKeys,
  toFiniteNumber,
} from './viz-axis-inference.utils';
import { TableDataSet } from './viz-table/viz-table.component';

export { toFiniteNumber };

/**
 * Canonical visualization identifiers supported across the web and mobile clients.
 */
export type CanonicalVisualizationType =
  'table' | 'metric' | 'scalar' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'heatmap' | 'markdown';

/**
 * Normalized visualization identifier including `'unknown'` for unrecognized legacy strings.
 */
export type NormalizedVisualizationType = CanonicalVisualizationType | 'unknown';

/**
 * Machine-readable error codes describing why a SQL query or dataset is incompatible
 * with a target visualization representation.
 */
export type VizIncompatibilityCode =
  | 'EMPTY_SQL_QUERY'
  | 'SINGLE_SCALAR_SQL_FOR_MULTI_AXIS_VIZ'
  | 'INCOMPATIBLE_TOO_FEW_COLUMNS'
  | 'INCOMPATIBLE_MISSING_AXIS_COLUMN'
  | 'INCOMPATIBLE_NON_NUMERIC_VALUES'
  | 'INCOMPATIBLE_NON_NUMERIC_Y_AXIS'
  | 'INCOMPATIBLE_NEGATIVE_VALUES_FOR_PIE'
  | 'INCOMPATIBLE_ZERO_TOTAL_FOR_PIE'
  | 'INCOMPATIBLE_SINGLE_ROW_FOR_LINE'
  | 'INCOMPATIBLE_HEATMAP_DIMENSIONS'
  | 'INCOMPATIBLE_NON_NUMERIC_SCALAR'
  | 'INCOMPATIBLE_SQL_FOR_MARKDOWN'
  | 'UNKNOWN_VISUALIZATION_TYPE';

/**
 * Machine-readable non-blocking usability warning codes for SQL-to-visualization pairings.
 */
export type VizWarningCode =
  | 'WARNING_HIGH_CARDINALITY_PIE'
  | 'WARNING_MULTI_ROW_TRUNCATED_TO_SCALAR'
  | 'WARNING_MULTI_ROW_TRUNCATED_TO_METRIC'
  | 'WARNING_NON_NUMERIC_THRESHOLD_METRIC';

/**
 * Non-blocking usability warning emitted when a visualization is renderable
 * but may truncate or crowd the underlying SQL dataset.
 */
export interface VisualizationCompatibilityWarning {
  /** Machine-readable warning code. */
  code: VizWarningCode;
  /** Localized human-readable warning message. */
  message: string;
}

/**
 * Optional configuration inspected during visualization compatibility validation.
 */
export interface VizValidationConfig extends AxisInferenceConfig {
  /** Optional numeric alert thresholds configured on metric or table widgets. */
  thresholds?: {
    warning?: number;
    critical?: number;
  };
}

/**
 * Structured result returned by `validateVisualizationCompatibility` and `validateSqlQueryForVisualization`.
 */
export interface VisualizationCompatibilityResult {
  /** Whether the dataset or SQL query can be validly represented by the target visualization. */
  compatible: boolean;
  /** Canonical normalized visualization type. */
  normalizedViz: NormalizedVisualizationType;
  /** Machine-readable incompatibility reason code when `compatible` is `false`. */
  code?: VizIncompatibilityCode;
  /** Localized explanation of why the visualization is not applicable when `compatible` is `false`. */
  reason?: string;
  /** Ordered list of alternative visualizations that are applicable to the dataset. */
  suggestedVisualizations: CanonicalVisualizationType[];
  /** Non-blocking usability warnings when `compatible` is `true`. */
  warnings: VisualizationCompatibilityWarning[];
}

/**
 * Ordered list of all SQL-applicable canonical visualization types.
 */
export const SQL_APPLICABLE_VISUALIZATIONS: readonly CanonicalVisualizationType[] = [
  'table',
  'metric',
  'scalar',
  'bar_chart',
  'line_chart',
  'pie_chart',
  'heatmap',
];

/**
 * Normalizes a raw visualization wire string and optional widget source type
 * into a canonical `NormalizedVisualizationType`.
 *
 * @param rawViz - Raw visualization string stored on the widget (e.g. `'pie'`, `'pie_chart'`, `'line_graph'`).
 * @param widgetType - Optional widget source type (`'SQL'`, `'HTTP'`, `'TEXT'`, `'TEMPLATE'`).
 * @returns Canonical visualization identifier or `'unknown'`.
 */
export function normalizeVisualizationType(
  rawViz: string | null | undefined,
  widgetType?: string | null,
): NormalizedVisualizationType {
  if (typeof widgetType === 'string' && widgetType.trim().toUpperCase() === 'TEXT') {
    return 'markdown';
  }
  const cleaned = typeof rawViz === 'string' ? rawViz.trim().toLowerCase() : '';
  if (!cleaned || cleaned === 'table' || cleaned === 'grid') {
    return 'table';
  }
  if (cleaned === 'metric' || cleaned === 'kpi') {
    return 'metric';
  }
  if (cleaned === 'scalar' || cleaned === 'gauge') {
    return 'scalar';
  }
  if (cleaned === 'bar_chart' || cleaned === 'barchart' || cleaned === 'bar') {
    return 'bar_chart';
  }
  if (
    cleaned === 'line_chart' ||
    cleaned === 'line_graph' ||
    cleaned === 'linechart' ||
    cleaned === 'line'
  ) {
    return 'line_chart';
  }
  if (cleaned === 'pie_chart' || cleaned === 'pie' || cleaned === 'donut') {
    return 'pie_chart';
  }
  if (cleaned === 'heatmap' || cleaned === 'matrix') {
    return 'heatmap';
  }
  if (cleaned === 'markdown' || cleaned === 'text' || cleaned === 'note') {
    return 'markdown';
  }
  return 'unknown';
}

/**
 * Performs a static structural pre-check of a raw SQL query string against a target visualization
 * prior to or independent of query execution.
 *
 * Detects empty SQL queries and single-scalar aggregate projections (`SELECT COUNT(*) FROM ...`
 * with a single expression and no `GROUP BY`) paired with multi-axis visualizations.
 *
 * @param sql - Raw SQL query string.
 * @param rawViz - Target visualization identifier.
 * @returns Structured `VisualizationCompatibilityResult`.
 */
export function validateSqlQueryForVisualization(
  sql: string | null | undefined,
  rawViz: string | null | undefined,
): VisualizationCompatibilityResult {
  const normalizedViz = normalizeVisualizationType(rawViz, 'SQL');
  if (normalizedViz === 'unknown') {
    return {
      compatible: false,
      normalizedViz,
      code: 'UNKNOWN_VISUALIZATION_TYPE',
      reason: $localize`Unsupported visualization type "${String(rawViz)}".`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }
  if (normalizedViz === 'markdown') {
    return {
      compatible: false,
      normalizedViz,
      code: 'INCOMPATIBLE_SQL_FOR_MARKDOWN',
      reason: $localize`Markdown visualization is only applicable to static text widgets, not SQL queries.`,
      suggestedVisualizations: ['table', 'metric'],
      warnings: [],
    };
  }

  const trimmedSql = typeof sql === 'string' ? sql.trim() : '';
  if (!trimmedSql) {
    return {
      compatible: false,
      normalizedViz,
      code: 'EMPTY_SQL_QUERY',
      reason: $localize`SQL query cannot be empty.`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }

  const multiAxisVisualizations: readonly CanonicalVisualizationType[] = [
    'pie_chart',
    'bar_chart',
    'line_chart',
    'heatmap',
  ];
  if (multiAxisVisualizations.includes(normalizedViz) && isSingleScalarAggregateSql(trimmedSql)) {
    return {
      compatible: false,
      normalizedViz,
      code: 'SINGLE_SCALAR_SQL_FOR_MULTI_AXIS_VIZ',
      reason: $localize`This SQL query returns a single scalar aggregate with 1 column and no GROUP BY clause, which is not applicable to ${formatVizLabel(normalizedViz)}.`,
      suggestedVisualizations: ['metric', 'scalar', 'table'],
      warnings: [],
    };
  }

  return {
    compatible: true,
    normalizedViz,
    suggestedVisualizations: [normalizedViz],
    warnings: [],
  };
}

/**
 * Heuristically detects whether a SQL query is a single-column scalar aggregate
 * (`SELECT COUNT(*) FROM table` without commas, `SELECT *`, or `GROUP BY`).
 *
 * @param sql - Non-empty trimmed SQL query string.
 * @returns True if the query projects a single scalar expression without grouping.
 */
function isSingleScalarAggregateSql(sql: string): boolean {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  if (/\bgroup\s+by\b/i.test(normalized) || /\bwith\b/i.test(normalized)) {
    return false;
  }
  const selectMatch = /^select\s+(.+?)\s+from\s+/i.exec(normalized);
  if (!selectMatch) {
    return false;
  }
  const projection = String(selectMatch[1]).trim();
  if (projection === '*' || projection.endsWith('.*')) {
    return false;
  }
  // Strip parenthesized function arguments to check for top-level projection commas
  const withoutParens = projection.replace(/\([^()]*\)/g, '');
  if (withoutParens.includes(',')) {
    return false;
  }
  return /\b(count|sum|avg|min|max|round|coalesce)\s*\(/i.test(projection);
}

/**
 * Formats a canonical visualization type into a localized human-readable label.
 *
 * @param viz - Canonical visualization identifier.
 * @returns Localized display name.
 */
export function formatVizLabel(viz: CanonicalVisualizationType): string {
  switch (viz) {
    case 'pie_chart':
      return $localize`Pie Chart`;
    case 'bar_chart':
      return $localize`Bar Chart`;
    case 'line_chart':
      return $localize`Line Chart`;
    case 'heatmap':
      return $localize`Heatmap`;
    case 'scalar':
      return $localize`Scalar Gauge`;
    case 'metric':
      return $localize`Metric Card`;
    case 'markdown':
      return $localize`Markdown`;
    case 'table':
      return $localize`Table`;
  }
}

/**
 * Validates whether an executed SQL `TableDataSet` and optional axis configuration
 * are applicable to the requested visualization representation.
 *
 * @param rawViz - Requested visualization type string.
 * @param dataSet - Executed tabular dataset (`columns` and `data` rows).
 * @param config - Optional chart/metric configuration (`xKey`, `yKey`, `thresholds`).
 * @param widgetType - Optional widget source type (`'SQL'`, `'HTTP'`, `'TEXT'`, `'TEMPLATE'`).
 * @returns Structured `VisualizationCompatibilityResult` with compatibility status, reason, suggestions, and warnings.
 */
export function validateVisualizationCompatibility(
  rawViz: string | null | undefined,
  dataSet: TableDataSet | null | undefined,
  config?: VizValidationConfig | null,
  widgetType?: string | null,
): VisualizationCompatibilityResult {
  const normalizedViz = normalizeVisualizationType(rawViz, widgetType);

  if (normalizedViz === 'unknown') {
    return {
      compatible: false,
      normalizedViz,
      code: 'UNKNOWN_VISUALIZATION_TYPE',
      reason: $localize`Unsupported visualization type "${String(rawViz)}".`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }

  const upperWidgetType = typeof widgetType === 'string' ? widgetType.trim().toUpperCase() : 'SQL';
  if (upperWidgetType === 'TEXT') {
    return {
      compatible: true,
      normalizedViz: 'markdown',
      suggestedVisualizations: ['markdown'],
      warnings: [],
    };
  }

  if (normalizedViz === 'markdown') {
    return {
      compatible: false,
      normalizedViz,
      code: 'INCOMPATIBLE_SQL_FOR_MARKDOWN',
      reason: $localize`Markdown visualization is not applicable to SQL query results.`,
      suggestedVisualizations: ['table', 'metric'],
      warnings: [],
    };
  }

  const cols = dataSet?.columns ?? [];
  const rows = dataSet?.data ?? [];

  if (cols.length === 0) {
    return {
      compatible: true,
      normalizedViz,
      suggestedVisualizations: [normalizedViz],
      warnings: [],
    };
  }

  // Validate explicit axis column overrides when columns are known
  if (
    normalizedViz === 'pie_chart' ||
    normalizedViz === 'bar_chart' ||
    normalizedViz === 'line_chart' ||
    normalizedViz === 'heatmap'
  ) {
    if (config?.xKey && !cols.includes(config.xKey)) {
      return {
        compatible: false,
        normalizedViz,
        code: 'INCOMPATIBLE_MISSING_AXIS_COLUMN',
        reason: $localize`Configured X-axis/label column "${config.xKey}" is not present in the SQL query result columns (${cols.join(', ')}).`,
        suggestedVisualizations: ['table'],
        warnings: [],
      };
    }
    if (config?.yKey && !cols.includes(config.yKey)) {
      return {
        compatible: false,
        normalizedViz,
        code: 'INCOMPATIBLE_MISSING_AXIS_COLUMN',
        reason: $localize`Configured Y-axis/value column "${config.yKey}" is not present in the SQL query result columns (${cols.join(', ')}).`,
        suggestedVisualizations: ['table'],
        warnings: [],
      };
    }
  }

  switch (normalizedViz) {
    case 'pie_chart':
      return validatePieCompatibility(cols, rows, config);
    case 'bar_chart':
      return validateBarCompatibility(cols, rows, config);
    case 'line_chart':
      return validateLineCompatibility(cols, rows, config);
    case 'heatmap':
      return validateHeatmapCompatibility(cols, rows, config);
    case 'scalar':
      return validateScalarCompatibility(cols, rows);
    case 'metric':
      return validateMetricCompatibility(cols, rows, config);
    case 'table':
      return {
        compatible: true,
        normalizedViz: 'table',
        suggestedVisualizations: ['table'],
        warnings: [],
      };
  }
}

/**
 * Validates dataset applicability for `pie_chart` (requires >= 2 columns, numeric values,
 * non-negative numbers, and total > 0).
 *
 * @param cols - Dataset column names.
 * @param rows - Dataset row records.
 * @param config - Optional axis mapping configuration.
 * @returns Compatibility result for `pie_chart`.
 */
function validatePieCompatibility(
  cols: readonly string[],
  rows: readonly Record<string, unknown>[],
  config?: VizValidationConfig | null,
): VisualizationCompatibilityResult {
  if (cols.length < 2) {
    return {
      compatible: false,
      normalizedViz: 'pie_chart',
      code: 'INCOMPATIBLE_TOO_FEW_COLUMNS',
      reason: $localize`Pie Chart requires at least 2 columns (a category label column and a numeric size column), but the SQL query returned ${cols.length} column.`,
      suggestedVisualizations: ['metric', 'scalar', 'table'],
      warnings: [],
    };
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return {
      compatible: true,
      normalizedViz: 'pie_chart',
      suggestedVisualizations: ['pie_chart', 'table'],
      warnings: [],
    };
  }

  const { valueKey } = inferPieSliceKeys(cols, firstRow, config ?? undefined);
  const numericValues: number[] = [];
  for (const row of rows) {
    const num = toFiniteNumber(row[valueKey]);
    if (num !== null) {
      numericValues.push(num);
    }
  }

  if (numericValues.length === 0) {
    return {
      compatible: false,
      normalizedViz: 'pie_chart',
      code: 'INCOMPATIBLE_NON_NUMERIC_VALUES',
      reason: $localize`Pie Chart requires numeric slice values, but column "${valueKey}" contains only non-numeric values.`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }

  if (numericValues.some((v) => v < 0)) {
    return {
      compatible: false,
      normalizedViz: 'pie_chart',
      code: 'INCOMPATIBLE_NEGATIVE_VALUES_FOR_PIE',
      reason: $localize`Pie Chart cannot represent negative values found in column "${valueKey}". Use a Bar Chart or Table for signed metrics.`,
      suggestedVisualizations: ['bar_chart', 'table'],
      warnings: [],
    };
  }

  const total = numericValues.reduce((acc, v) => acc + v, 0);
  if (total <= 0) {
    return {
      compatible: false,
      normalizedViz: 'pie_chart',
      code: 'INCOMPATIBLE_ZERO_TOTAL_FOR_PIE',
      reason: $localize`Pie Chart requires a positive total sum across slices, but column "${valueKey}" sums to 0.`,
      suggestedVisualizations: ['table', 'bar_chart'],
      warnings: [],
    };
  }

  const warnings: VisualizationCompatibilityWarning[] = [];
  if (rows.length > 25) {
    warnings.push({
      code: 'WARNING_HIGH_CARDINALITY_PIE',
      message: $localize`Query returned ${rows.length} rows; Pie Charts are hardest to read above 25 slices. Consider a Bar Chart, Table, or SQL LIMIT.`,
    });
  }

  return {
    compatible: true,
    normalizedViz: 'pie_chart',
    suggestedVisualizations: ['pie_chart', 'bar_chart', 'table'],
    warnings,
  };
}

/**
 * Validates dataset applicability for `bar_chart` (requires >= 2 columns and a numeric Y-axis column).
 *
 * @param cols - Dataset column names.
 * @param rows - Dataset row records.
 * @param config - Optional axis mapping configuration.
 * @returns Compatibility result for `bar_chart`.
 */
function validateBarCompatibility(
  cols: readonly string[],
  rows: readonly Record<string, unknown>[],
  config?: VizValidationConfig | null,
): VisualizationCompatibilityResult {
  if (cols.length < 2) {
    return {
      compatible: false,
      normalizedViz: 'bar_chart',
      code: 'INCOMPATIBLE_TOO_FEW_COLUMNS',
      reason: $localize`Bar Chart requires at least 2 columns (an X-axis category column and a numeric Y-axis column), but the SQL query returned ${cols.length} column.`,
      suggestedVisualizations: ['metric', 'scalar', 'table'],
      warnings: [],
    };
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return {
      compatible: true,
      normalizedViz: 'bar_chart',
      suggestedVisualizations: ['bar_chart', 'table'],
      warnings: [],
    };
  }

  const { y } = inferChartAxisKeys(cols, firstRow, config ?? undefined);
  const hasNumericY = rows.some((r) => toFiniteNumber(r[y]) !== null);
  if (!hasNumericY) {
    return {
      compatible: false,
      normalizedViz: 'bar_chart',
      code: 'INCOMPATIBLE_NON_NUMERIC_Y_AXIS',
      reason: $localize`Bar Chart requires a numeric Y-axis column, but column "${y}" contains only non-numeric text values.`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }

  return {
    compatible: true,
    normalizedViz: 'bar_chart',
    suggestedVisualizations: ['bar_chart', 'line_chart', 'table'],
    warnings: [],
  };
}

/**
 * Validates dataset applicability for `line_chart` (requires >= 2 columns, a numeric Y-axis column,
 * and >= 2 rows to plot a trend line).
 *
 * @param cols - Dataset column names.
 * @param rows - Dataset row records.
 * @param config - Optional axis mapping configuration.
 * @returns Compatibility result for `line_chart`.
 */
function validateLineCompatibility(
  cols: readonly string[],
  rows: readonly Record<string, unknown>[],
  config?: VizValidationConfig | null,
): VisualizationCompatibilityResult {
  if (cols.length < 2) {
    return {
      compatible: false,
      normalizedViz: 'line_chart',
      code: 'INCOMPATIBLE_TOO_FEW_COLUMNS',
      reason: $localize`Line Chart requires at least 2 columns (an X-axis sequence column and a numeric Y-axis column), but the SQL query returned ${cols.length} column.`,
      suggestedVisualizations: ['metric', 'scalar', 'table'],
      warnings: [],
    };
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return {
      compatible: true,
      normalizedViz: 'line_chart',
      suggestedVisualizations: ['line_chart', 'table'],
      warnings: [],
    };
  }

  const { y } = inferChartAxisKeys(cols, firstRow, config ?? undefined);
  const hasNumericY = rows.some((r) => toFiniteNumber(r[y]) !== null);
  if (!hasNumericY) {
    return {
      compatible: false,
      normalizedViz: 'line_chart',
      code: 'INCOMPATIBLE_NON_NUMERIC_Y_AXIS',
      reason: $localize`Line Chart requires a numeric Y-axis column, but column "${y}" contains only non-numeric text values.`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }

  if (rows.length < 2) {
    return {
      compatible: false,
      normalizedViz: 'line_chart',
      code: 'INCOMPATIBLE_SINGLE_ROW_FOR_LINE',
      reason: $localize`Line Chart requires at least 2 data rows to plot a trend, but the SQL query returned only 1 row.`,
      suggestedVisualizations: ['metric', 'scalar', 'bar_chart', 'table'],
      warnings: [],
    };
  }

  return {
    compatible: true,
    normalizedViz: 'line_chart',
    suggestedVisualizations: ['line_chart', 'bar_chart', 'table'],
    warnings: [],
  };
}

/**
 * Validates dataset applicability for `heatmap` (requires >= 3 columns: Y category, X category,
 * and a numeric intensity column).
 *
 * @param cols - Dataset column names.
 * @param rows - Dataset row records.
 * @param config - Optional axis mapping configuration.
 * @returns Compatibility result for `heatmap`.
 */
function validateHeatmapCompatibility(
  cols: readonly string[],
  rows: readonly Record<string, unknown>[],
  config?: VizValidationConfig | null,
): VisualizationCompatibilityResult {
  if (cols.length < 3) {
    const fallbackSuggestions: CanonicalVisualizationType[] =
      cols.length === 2 ? ['bar_chart', 'pie_chart', 'table'] : ['metric', 'scalar', 'table'];
    return {
      compatible: false,
      normalizedViz: 'heatmap',
      code: 'INCOMPATIBLE_HEATMAP_DIMENSIONS',
      reason: $localize`Heatmap requires at least 3 columns (Y-axis category, X-axis bucket, and numeric intensity), but the SQL query returned ${cols.length} column(s).`,
      suggestedVisualizations: fallbackSuggestions,
      warnings: [],
    };
  }

  if (rows.length === 0) {
    return {
      compatible: true,
      normalizedViz: 'heatmap',
      suggestedVisualizations: ['heatmap', 'table'],
      warnings: [],
    };
  }

  const valKey =
    (config?.yKey && cols.includes(config.yKey) ? config.yKey : undefined) ||
    cols.find((c) => c.toLowerCase() === 'net_bottleneck') ||
    String(cols.length > 3 ? cols[cols.length - 1] : cols[2]);

  const hasNumericIntensity = rows.some((r) => toFiniteNumber(r[valKey]) !== null);
  if (!hasNumericIntensity) {
    return {
      compatible: false,
      normalizedViz: 'heatmap',
      code: 'INCOMPATIBLE_NON_NUMERIC_VALUES',
      reason: $localize`Heatmap requires numeric intensity values, but column "${valKey}" contains only non-numeric text values.`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }

  return {
    compatible: true,
    normalizedViz: 'heatmap',
    suggestedVisualizations: ['heatmap', 'table'],
    warnings: [],
  };
}

/**
 * Validates dataset applicability for `scalar` (requires at least one numeric column in row 0).
 *
 * @param cols - Dataset column names.
 * @param rows - Dataset row records.
 * @returns Compatibility result for `scalar`.
 */
function validateScalarCompatibility(
  cols: readonly string[],
  rows: readonly Record<string, unknown>[],
): VisualizationCompatibilityResult {
  const firstRow = rows[0];
  if (!firstRow) {
    return {
      compatible: true,
      normalizedViz: 'scalar',
      suggestedVisualizations: ['scalar', 'table'],
      warnings: [],
    };
  }

  const hasNumericCell = Object.keys(firstRow).some((k) => toFiniteNumber(firstRow[k]) !== null);
  if (!hasNumericCell) {
    return {
      compatible: false,
      normalizedViz: 'scalar',
      code: 'INCOMPATIBLE_NON_NUMERIC_SCALAR',
      reason: $localize`Scalar Gauge requires a numeric value in the query result, but the returned columns (${cols.join(', ')}) contain only non-numeric text.`,
      suggestedVisualizations: ['table'],
      warnings: [],
    };
  }

  const warnings: VisualizationCompatibilityWarning[] = [];
  if (rows.length > 1 || cols.length > 2) {
    warnings.push({
      code: 'WARNING_MULTI_ROW_TRUNCATED_TO_SCALAR',
      message: $localize`Query returned ${rows.length} row(s) and ${cols.length} column(s); Scalar Gauge displays only the first numeric metric from row 1.`,
    });
  }

  return {
    compatible: true,
    normalizedViz: 'scalar',
    suggestedVisualizations: ['scalar', 'metric', 'table'],
    warnings,
  };
}

/**
 * Validates dataset applicability for `metric` (KPI card).
 *
 * @param cols - Dataset column names.
 * @param rows - Dataset row records.
 * @param config - Optional metric threshold configuration.
 * @returns Compatibility result for `metric`.
 */
function validateMetricCompatibility(
  cols: readonly string[],
  rows: readonly Record<string, unknown>[],
  config?: VizValidationConfig | null,
): VisualizationCompatibilityResult {
  const warnings: VisualizationCompatibilityWarning[] = [];
  const firstRow = rows[0];

  if (firstRow) {
    const primaryKey = String(cols[0]);
    const primaryVal = firstRow[primaryKey];
    const hasThresholds =
      config?.thresholds &&
      (config.thresholds.warning !== undefined || config.thresholds.critical !== undefined);
    if (hasThresholds && toFiniteNumber(primaryVal) === null) {
      warnings.push({
        code: 'WARNING_NON_NUMERIC_THRESHOLD_METRIC',
        message: $localize`Warning/critical thresholds are configured, but primary column "${primaryKey}" is non-numeric.`,
      });
    }
  }

  if (rows.length > 1) {
    warnings.push({
      code: 'WARNING_MULTI_ROW_TRUNCATED_TO_METRIC',
      message: $localize`Query returned ${rows.length} rows; Metric Card displays only the first row.`,
    });
  }

  return {
    compatible: true,
    normalizedViz: 'metric',
    suggestedVisualizations: ['metric', 'table'],
    warnings,
  };
}

/**
 * Computes the list of all canonical SQL visualizations that are compatible with the given `TableDataSet`.
 *
 * @param dataSet - Executed SQL dataset to evaluate.
 * @param config - Optional axis mapping configuration.
 * @returns Array of compatible `CanonicalVisualizationType` identifiers.
 */
export function getCompatibleVisualizationsForDataSet(
  dataSet: TableDataSet | null | undefined,
  config?: VizValidationConfig | null,
): CanonicalVisualizationType[] {
  return SQL_APPLICABLE_VISUALIZATIONS.filter(
    (viz) => validateVisualizationCompatibility(viz, dataSet, config, 'SQL').compatible,
  );
}
