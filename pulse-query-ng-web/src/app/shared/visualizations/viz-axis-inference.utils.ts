/**
 * @fileoverview Shared pure utility functions for inferring X, Y, and stack column keys
 * and coercing numeric values across chart and pie visualizations (`VizChartComponent`, `VizPieComponent`).
 */

/**
 * Axis mapping configuration options shared by chart and pie components.
 */
export interface AxisInferenceConfig {
  /** Explicit horizontal/category column name override. */
  xKey?: string | null | undefined;
  /** Explicit vertical/value column name override. */
  yKey?: string | null | undefined;
  /** Explicit stacking series column name override. */
  stackBy?: string | null | undefined;
}

/**
 * Resolved X, Y, and stacking column keys for tabular datasets.
 */
export interface InferredAxisKeys {
  /** Resolved category/label column name. */
  x: string;
  /** Resolved numeric value column name. */
  y: string;
  /** Resolved optional series stacking column name (`''` if unstacked). */
  stack: string;
}

/**
 * Coerces a raw cell value (number or numeric string such as DuckDB `DECIMAL`/`BIGINT` output)
 * into a finite JavaScript `number`, or returns `null` if the value is not numeric.
 *
 * @param val - Raw value from a dataset row cell.
 * @returns Finite number or `null`.
 */
export function toFiniteNumber(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) {
      return null;
    }
    const cleaned = trimmed.endsWith('%') ? trimmed.slice(0, -1).trim() : trimmed;
    if (!cleaned) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Infers category (`x`), numeric value (`y`), and optional series (`stack`) column names
 * for bar, line, and stacked-column charts.
 *
 * @param columns - Optional ordered column list from the dataset.
 * @param firstRow - First row object of the dataset used for runtime type inspection.
 * @param config - Optional explicit `xKey`, `yKey`, and `stackBy` overrides.
 * @returns Resolved `InferredAxisKeys` object.
 */
export function inferChartAxisKeys(
  columns: readonly string[] | undefined,
  firstRow: Record<string, unknown>,
  config?: AxisInferenceConfig,
): InferredAxisKeys {
  const cols = columns && columns.length > 0 ? [...columns] : Object.keys(firstRow);
  if (cols.length === 0) {
    return { x: '', y: '', stack: '' };
  }

  const x =
    config?.xKey ||
    cols.find((c) => typeof firstRow[c] === 'string' && toFiniteNumber(firstRow[c]) === null) ||
    cols.find((c) => typeof firstRow[c] === 'string') ||
    (cols[0] as string);
  const y =
    config?.yKey ||
    cols.find(
      (c) => typeof firstRow[c] === 'number' || (c !== x && toFiniteNumber(firstRow[c]) !== null),
    ) ||
    cols[1] ||
    (cols[0] as string);
  let stack = config?.stackBy || '';

  if (!config?.stackBy && cols.length >= 3) {
    const potentialStack = cols.find(
      (c) => c !== x && typeof firstRow[c] === 'string' && toFiniteNumber(firstRow[c]) === null,
    );
    if (potentialStack) {
      stack = potentialStack;
    }
  }

  return { x, y, stack };
}

/**
 * Infers label (`x`) and numeric value (`y`) column names for pie charts, validating
 * explicit config overrides against `availableCols`.
 *
 * @param availableCols - Ordered column names present in the dataset.
 * @param firstRow - First row object of the dataset used for numeric column detection.
 * @param config - Optional explicit `xKey` and `yKey` overrides.
 * @returns Tuple of `{ labelKey, valueKey }`.
 */
export function inferPieSliceKeys(
  availableCols: readonly string[],
  firstRow: Record<string, unknown>,
  config?: AxisInferenceConfig,
): { labelKey: string; valueKey: string } {
  let labelKey = availableCols[0] as string;
  const numericCol = availableCols
    .slice(1)
    .find((c) => typeof firstRow[c] === 'number' || toFiniteNumber(firstRow[c]) !== null);
  let valueKey = numericCol || availableCols[1] || (availableCols[0] as string);

  if (config?.xKey && availableCols.includes(config.xKey)) {
    labelKey = config.xKey;
  }
  if (config?.yKey && availableCols.includes(config.yKey)) {
    valueKey = config.yKey;
  }

  return { labelKey, valueKey };
}
