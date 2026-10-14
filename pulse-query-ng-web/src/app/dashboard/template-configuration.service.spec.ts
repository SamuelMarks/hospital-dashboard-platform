/**
 * @fileoverview Unit tests for `TemplateConfigurationService`.
 */

import { TestBed } from '@angular/core/testing';
import { TemplateConfigurationService } from './template-configuration.service';
import { TemplateResponse } from '../api-client';

describe('TemplateConfigurationService', () => {
  let service: TemplateConfigurationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TemplateConfigurationService],
    });
    service = TestBed.inject(TemplateConfigurationService);
  });

  it('detects whether schema has parameters', () => {
    expect(service.hasSchemaParameters(undefined)).toBe(false);
    expect(service.hasSchemaParameters(null)).toBe(false);
    expect(service.hasSchemaParameters({})).toBe(false);
    expect(service.hasSchemaParameters({ properties: null })).toBe(false);
    expect(service.hasSchemaParameters({ properties: {} })).toBe(false);
    expect(service.hasSchemaParameters({ properties: { unit: { type: 'string' } } })).toBe(true);
  });

  it('extracts default parameters safely', () => {
    expect(service.extractDefaultParameters(undefined)).toEqual({});
    expect(service.extractDefaultParameters({})).toEqual({});
    expect(
      service.extractDefaultParameters({
        properties: {
          unit: { default: 'ICU' },
          limit: { type: 'integer' },
          emptyProp: undefined,
        },
      }),
    ).toEqual({ unit: 'ICU' });
  });

  it('interpolates SQL placeholders and ignores null/undefined values', () => {
    const raw = "SELECT * FROM t WHERE unit = '{{ unit }}' AND limit = {{limit}}";
    expect(service.interpolateSql(raw, { unit: 'NICU', limit: 25, ignored: null })).toBe(
      "SELECT * FROM t WHERE unit = 'NICU' AND limit = 25",
    );
    expect(service.interpolateSql('', { unit: 'ICU' })).toBe('');
  });

  it('builds default config from template', () => {
    const template: TemplateResponse = {
      id: 't1',
      title: 'Census',
      category: 'Ops',
      sql_template: 'SELECT * FROM t WHERE unit = {{unit}}',
      parameters_schema: { properties: { unit: { default: 'ICU_A' } } },
    };
    expect(service.buildDefaultConfig(template)).toEqual({
      query: 'SELECT * FROM t WHERE unit = ICU_A',
    });
  });

  it('infers visualization types from title and SQL keywords', () => {
    expect(
      service.inferVisualization({ title: 'Service Breakdown', sql_template: 'SELECT 1' }),
    ).toBe('pie');
    expect(
      service.inferVisualization({ title: 'Daily Trend', sql_template: 'SELECT 1 GROUP BY d' }),
    ).toBe('bar_chart');
    expect(
      service.inferVisualization({ title: 'Readmission Risk', sql_template: 'SELECT 1' }),
    ).toBe('scalar');
    expect(service.inferVisualization({ title: 'Admission Lag', sql_template: 'SELECT 1' })).toBe(
      'metric',
    );
    expect(service.inferVisualization({ title: 'Raw Roster', sql_template: 'SELECT 1' })).toBe(
      'table',
    );
  });
});
