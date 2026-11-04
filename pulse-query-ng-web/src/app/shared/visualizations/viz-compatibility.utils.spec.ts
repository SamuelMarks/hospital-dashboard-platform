/**
 * @fileoverview Unit tests for `viz-compatibility.utils.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  formatVizLabel,
  getCompatibleVisualizationsForDataSet,
  normalizeVisualizationType,
  toFiniteNumber,
  validateSqlQueryForVisualization,
  validateVisualizationCompatibility,
} from './viz-compatibility.utils';

describe('viz-compatibility.utils', () => {
  it('toFiniteNumber parses numbers, numeric strings, percentage strings, and rejects non-numeric values', () => {
    expect(toFiniteNumber(42)).toBe(42);
    expect(toFiniteNumber(-3.5)).toBe(-3.5);
    expect(toFiniteNumber(Number.NaN)).toBeNull();
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toFiniteNumber(' 94.2 ')).toBe(94.2);
    expect(toFiniteNumber('-12.5%')).toBe(-12.5);
    expect(toFiniteNumber('   ')).toBeNull();
    expect(toFiniteNumber('%')).toBeNull();
    expect(toFiniteNumber('abc')).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber({})).toBeNull();
  });

  it('normalizeVisualizationType resolves all canonical IDs, aliases, TEXT overrides, and unknown values', () => {
    expect(normalizeVisualizationType('table', 'TEXT')).toBe('markdown');
    expect(normalizeVisualizationType(undefined)).toBe('table');
    expect(normalizeVisualizationType(null)).toBe('table');
    expect(normalizeVisualizationType('')).toBe('table');
    expect(normalizeVisualizationType('table')).toBe('table');
    expect(normalizeVisualizationType('grid')).toBe('table');
    expect(normalizeVisualizationType('metric')).toBe('metric');
    expect(normalizeVisualizationType('kpi')).toBe('metric');
    expect(normalizeVisualizationType('scalar')).toBe('scalar');
    expect(normalizeVisualizationType('gauge')).toBe('scalar');
    expect(normalizeVisualizationType('bar_chart')).toBe('bar_chart');
    expect(normalizeVisualizationType('barchart')).toBe('bar_chart');
    expect(normalizeVisualizationType('bar')).toBe('bar_chart');
    expect(normalizeVisualizationType('line_chart')).toBe('line_chart');
    expect(normalizeVisualizationType('line_graph')).toBe('line_chart');
    expect(normalizeVisualizationType('linechart')).toBe('line_chart');
    expect(normalizeVisualizationType('line')).toBe('line_chart');
    expect(normalizeVisualizationType('pie_chart')).toBe('pie_chart');
    expect(normalizeVisualizationType('pie')).toBe('pie_chart');
    expect(normalizeVisualizationType('donut')).toBe('pie_chart');
    expect(normalizeVisualizationType('heatmap')).toBe('heatmap');
    expect(normalizeVisualizationType('matrix')).toBe('heatmap');
    expect(normalizeVisualizationType('markdown')).toBe('markdown');
    expect(normalizeVisualizationType('text')).toBe('markdown');
    expect(normalizeVisualizationType('note')).toBe('markdown');
    expect(normalizeVisualizationType('3d_hologram')).toBe('unknown');
  });

  it('formatVizLabel formats every canonical visualization type', () => {
    expect(formatVizLabel('pie_chart')).toBe('Pie Chart');
    expect(formatVizLabel('bar_chart')).toBe('Bar Chart');
    expect(formatVizLabel('line_chart')).toBe('Line Chart');
    expect(formatVizLabel('heatmap')).toBe('Heatmap');
    expect(formatVizLabel('scalar')).toBe('Scalar Gauge');
    expect(formatVizLabel('metric')).toBe('Metric Card');
    expect(formatVizLabel('markdown')).toBe('Markdown');
    expect(formatVizLabel('table')).toBe('Table');
  });

  it('validateSqlQueryForVisualization checks empty SQL, unknown viz, markdown vs SQL, and single-scalar SQL', () => {
    expect(validateSqlQueryForVisualization('SELECT 1', 'invalid_viz').code).toBe(
      'UNKNOWN_VISUALIZATION_TYPE',
    );
    expect(validateSqlQueryForVisualization('SELECT 1', null).code).toBeUndefined();
    expect(validateSqlQueryForVisualization('SELECT 1', 'markdown').code).toBe(
      'INCOMPATIBLE_SQL_FOR_MARKDOWN',
    );
    expect(validateSqlQueryForVisualization('', 'table').code).toBe('EMPTY_SQL_QUERY');
    expect(validateSqlQueryForVisualization(null, 'table').code).toBe('EMPTY_SQL_QUERY');

    // Single-scalar aggregate SQL on pie_chart / bar_chart / line_chart / heatmap
    const scalarSql = 'SELECT COUNT(*) AS total_rows FROM hospital_data';
    const pieCheck = validateSqlQueryForVisualization(scalarSql, 'pie_chart');
    expect(pieCheck.compatible).toBe(false);
    expect(pieCheck.code).toBe('SINGLE_SCALAR_SQL_FOR_MULTI_AXIS_VIZ');
    expect(pieCheck.suggestedVisualizations).toEqual(['metric', 'scalar', 'table']);

    // Metric with single-scalar aggregate SQL is compatible
    expect(validateSqlQueryForVisualization(scalarSql, 'metric').compatible).toBe(true);

    // SQL with GROUP BY, WITH CTE, SELECT *, or multiple columns is not flagged as single-scalar
    expect(
      validateSqlQueryForVisualization(
        'SELECT service, COUNT(*) AS cnt FROM hospital_data GROUP BY 1',
        'pie_chart',
      ).compatible,
    ).toBe(true);
    expect(
      validateSqlQueryForVisualization(
        'WITH cte AS (SELECT 1) SELECT COUNT(*) FROM cte',
        'pie_chart',
      ).compatible,
    ).toBe(true);
    expect(
      validateSqlQueryForVisualization('SELECT * FROM hospital_data', 'bar_chart').compatible,
    ).toBe(true);
    expect(
      validateSqlQueryForVisualization('SELECT t.* FROM hospital_data t', 'bar_chart').compatible,
    ).toBe(true);
    expect(
      validateSqlQueryForVisualization('SELECT unit, COUNT(*) FROM hospital_data', 'bar_chart')
        .compatible,
    ).toBe(true);
    expect(validateSqlQueryForVisualization('SHOW TABLES', 'bar_chart').compatible).toBe(true);
    expect(
      validateSqlQueryForVisualization('SELECT unit FROM hospital_data', 'bar_chart').compatible,
    ).toBe(true);
  });

  it('validateVisualizationCompatibility validates unknown, TEXT, markdown, empty columns, and missing axis keys', () => {
    expect(validateVisualizationCompatibility('bad_viz', null).code).toBe(
      'UNKNOWN_VISUALIZATION_TYPE',
    );
    expect(validateVisualizationCompatibility(undefined, null, null, 'TEXT').compatible).toBe(true);
    expect(validateVisualizationCompatibility('markdown', null, null, 'SQL').code).toBe(
      'INCOMPATIBLE_SQL_FOR_MARKDOWN',
    );
    expect(validateVisualizationCompatibility('table', null).compatible).toBe(true);
    expect(
      validateVisualizationCompatibility('pie_chart', { columns: [], data: [] }).compatible,
    ).toBe(true);

    const ds = {
      columns: ['service', 'census'],
      data: [{ service: 'ICU', census: 10 }],
    };
    expect(validateVisualizationCompatibility('bar_chart', ds, { xKey: 'missing_x' }).code).toBe(
      'INCOMPATIBLE_MISSING_AXIS_COLUMN',
    );
    expect(validateVisualizationCompatibility('bar_chart', ds, { yKey: 'missing_y' }).code).toBe(
      'INCOMPATIBLE_MISSING_AXIS_COLUMN',
    );
  });

  it('validateVisualizationCompatibility validates pie_chart rules and warnings', () => {
    expect(
      validateVisualizationCompatibility('pie_chart', {
        columns: ['only_one'],
        data: [{ only_one: 10 }],
      }).code,
    ).toBe('INCOMPATIBLE_TOO_FEW_COLUMNS');

    expect(
      validateVisualizationCompatibility('pie_chart', {
        columns: ['service', 'count'],
        data: [],
      }).compatible,
    ).toBe(true);

    expect(
      validateVisualizationCompatibility('pie_chart', {
        columns: ['service', 'label'],
        data: [{ service: 'ICU', label: 'North' }],
      }).code,
    ).toBe('INCOMPATIBLE_NON_NUMERIC_VALUES');

    expect(
      validateVisualizationCompatibility('pie_chart', {
        columns: ['service', 'net_flow'],
        data: [
          { service: 'ICU', net_flow: 10 },
          { service: 'ER', net_flow: -4 },
        ],
      }).code,
    ).toBe('INCOMPATIBLE_NEGATIVE_VALUES_FOR_PIE');

    expect(
      validateVisualizationCompatibility('pie_chart', {
        columns: ['service', 'cnt'],
        data: [
          { service: 'ICU', cnt: 0 },
          { service: 'ER', cnt: 0 },
        ],
      }).code,
    ).toBe('INCOMPATIBLE_ZERO_TOTAL_FOR_PIE');

    const manyRows = Array.from({ length: 26 }, (_, i) => ({
      service: `Unit ${i}`,
      cnt: i + 1,
    }));
    const highCard = validateVisualizationCompatibility('pie_chart', {
      columns: ['service', 'cnt'],
      data: manyRows,
    });
    expect(highCard.compatible).toBe(true);
    expect(highCard.warnings[0]?.code).toBe('WARNING_HIGH_CARDINALITY_PIE');
  });

  it('validateVisualizationCompatibility validates bar_chart and line_chart rules', () => {
    expect(
      validateVisualizationCompatibility('bar_chart', {
        columns: ['single'],
        data: [{ single: 1 }],
      }).code,
    ).toBe('INCOMPATIBLE_TOO_FEW_COLUMNS');

    expect(
      validateVisualizationCompatibility('bar_chart', {
        columns: ['x', 'y'],
        data: [],
      }).compatible,
    ).toBe(true);

    expect(
      validateVisualizationCompatibility('bar_chart', {
        columns: ['x', 'y'],
        data: [{ x: 'A', y: 'non-numeric' }],
      }).code,
    ).toBe('INCOMPATIBLE_NON_NUMERIC_Y_AXIS');

    expect(
      validateVisualizationCompatibility('bar_chart', {
        columns: ['x', 'y'],
        data: [{ x: 'A', y: 12 }],
      }).compatible,
    ).toBe(true);

    // Line chart rules
    expect(
      validateVisualizationCompatibility('line_chart', {
        columns: ['single'],
        data: [{ single: 1 }],
      }).code,
    ).toBe('INCOMPATIBLE_TOO_FEW_COLUMNS');

    expect(
      validateVisualizationCompatibility('line_chart', {
        columns: ['x', 'y'],
        data: [],
      }).compatible,
    ).toBe(true);

    expect(
      validateVisualizationCompatibility('line_chart', {
        columns: ['x', 'y'],
        data: [{ x: 'Day 1', y: 'text' }],
      }).code,
    ).toBe('INCOMPATIBLE_NON_NUMERIC_Y_AXIS');

    expect(
      validateVisualizationCompatibility('line_chart', {
        columns: ['x', 'y'],
        data: [{ x: 'Day 1', y: 10 }],
      }).code,
    ).toBe('INCOMPATIBLE_SINGLE_ROW_FOR_LINE');

    expect(
      validateVisualizationCompatibility('line_chart', {
        columns: ['x', 'y'],
        data: [
          { x: 'Day 1', y: 10 },
          { x: 'Day 2', y: 15 },
        ],
      }).compatible,
    ).toBe(true);
  });

  it('validateVisualizationCompatibility validates heatmap, scalar, metric, and table rules', () => {
    const oneCol = validateVisualizationCompatibility('heatmap', {
      columns: ['a'],
      data: [{ a: 1 }],
    });
    expect(oneCol.code).toBe('INCOMPATIBLE_HEATMAP_DIMENSIONS');
    expect(oneCol.suggestedVisualizations).toEqual(['metric', 'scalar', 'table']);

    const twoCol = validateVisualizationCompatibility('heatmap', {
      columns: ['a', 'b'],
      data: [{ a: 'X', b: 1 }],
    });
    expect(twoCol.code).toBe('INCOMPATIBLE_HEATMAP_DIMENSIONS');
    expect(twoCol.suggestedVisualizations).toEqual(['bar_chart', 'pie_chart', 'table']);

    expect(
      validateVisualizationCompatibility('heatmap', {
        columns: ['svc', 'hr', 'load'],
        data: [],
      }).compatible,
    ).toBe(true);

    expect(
      validateVisualizationCompatibility('heatmap', {
        columns: ['svc', 'hr', 'load'],
        data: [{ svc: 'ICU', hr: 8, load: 'non-numeric' }],
      }).code,
    ).toBe('INCOMPATIBLE_NON_NUMERIC_VALUES');

    expect(
      validateVisualizationCompatibility(
        'heatmap',
        {
          columns: ['svc', 'hr', 'admits', 'net_bottleneck'],
          data: [{ svc: 'ICU', hr: 8, admits: 4, net_bottleneck: -2 }],
        },
        { yKey: 'net_bottleneck' },
      ).compatible,
    ).toBe(true);

    expect(
      validateVisualizationCompatibility('heatmap', {
        columns: ['svc', 'hr', 'admits', 'extra_score'],
        data: [{ svc: 'ICU', hr: 8, admits: 4, extra_score: 9 }],
      }).compatible,
    ).toBe(true);

    // Scalar
    expect(
      validateVisualizationCompatibility('scalar', {
        columns: ['prob'],
        data: [],
      }).compatible,
    ).toBe(true);

    expect(
      validateVisualizationCompatibility('scalar', {
        columns: ['blockage_date'],
        data: [{ blockage_date: '2026-10-01' }],
      }).code,
    ).toBe('INCOMPATIBLE_NON_NUMERIC_SCALAR');

    const singleRowScalar = validateVisualizationCompatibility('scalar', {
      columns: ['prob'],
      data: [{ prob: 0.85 }],
    });
    expect(singleRowScalar.compatible).toBe(true);
    expect(singleRowScalar.warnings).toEqual([]);

    const wideSingleRowScalar = validateVisualizationCompatibility('scalar', {
      columns: ['unit', 'service', 'prob'],
      data: [{ unit: 'ICU', service: 'Cardiology', prob: 0.85 }],
    });
    expect(wideSingleRowScalar.compatible).toBe(true);
    expect(wideSingleRowScalar.warnings[0]?.code).toBe('WARNING_MULTI_ROW_TRUNCATED_TO_SCALAR');

    const multiRowScalar = validateVisualizationCompatibility('scalar', {
      columns: ['unit', 'prob'],
      data: [
        { unit: 'ICU', prob: 0.85 },
        { unit: 'ER', prob: 0.42 },
      ],
    });
    expect(multiRowScalar.compatible).toBe(true);
    expect(multiRowScalar.warnings[0]?.code).toBe('WARNING_MULTI_ROW_TRUNCATED_TO_SCALAR');

    // Metric
    const metricWarn = validateVisualizationCompatibility(
      'metric',
      {
        columns: ['unit', 'cnt'],
        data: [
          { unit: 'ICU', cnt: 10 },
          { unit: 'ER', cnt: 20 },
        ],
      },
      { thresholds: { warning: 5 } },
    );
    expect(metricWarn.compatible).toBe(true);
    expect(metricWarn.warnings.map((w) => w.code)).toEqual([
      'WARNING_NON_NUMERIC_THRESHOLD_METRIC',
      'WARNING_MULTI_ROW_TRUNCATED_TO_METRIC',
    ]);

    const metricCritOnly = validateVisualizationCompatibility(
      'metric',
      {
        columns: ['unit'],
        data: [{ unit: 'ICU' }],
      },
      { thresholds: { critical: 10 } },
    );
    expect(metricCritOnly.warnings[0]?.code).toBe('WARNING_NON_NUMERIC_THRESHOLD_METRIC');

    expect(
      validateVisualizationCompatibility(
        'metric',
        { columns: ['cnt'], data: [{ cnt: 12 }] },
        { thresholds: { warning: 10 } },
      ).warnings,
    ).toEqual([]);
    expect(
      validateVisualizationCompatibility('metric', { columns: ['cnt'], data: [] }).warnings,
    ).toEqual([]);

    // Table
    expect(
      validateVisualizationCompatibility('table', {
        columns: ['a'],
        data: [{ a: 1 }],
      }).compatible,
    ).toBe(true);

    // getCompatibleVisualizationsForDataSet
    const compatList = getCompatibleVisualizationsForDataSet({
      columns: ['unit', 'cnt'],
      data: [
        { unit: 'ICU', cnt: 10 },
        { unit: 'ER', cnt: 20 },
      ],
    });
    expect(compatList).toEqual([
      'table',
      'metric',
      'scalar',
      'bar_chart',
      'line_chart',
      'pie_chart',
    ]);
  });
});
