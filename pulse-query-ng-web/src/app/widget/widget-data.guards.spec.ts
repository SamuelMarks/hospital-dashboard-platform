/**
 * @fileoverview Unit tests for `widget-data.guards.ts` runtime type-guard and narrowing parsers.
 */

import { describe, expect, it } from 'vitest';
import {
  extractExecutionErrorMessage,
  extractMarkdownContent,
  extractTabularExportRows,
  narrowRecordPayload,
  parseChartConfig,
  parseMetricData,
  parseScalarData,
  parseSqlWidgetConfig,
  parseTableDataSet,
  parseTypedWidgetConfig,
} from './widget-data.guards';

describe('widget-data.guards', () => {
  describe('parseTypedWidgetConfig', () => {
    it('parses TEXT, HTTP, and SQL widget configurations across default and custom fields', () => {
      expect(parseSqlWidgetConfig(null)).toEqual({
        kind: 'SQL',
        query: '',
        allowNaturalText: false,
        processor: 'SQL',
        naturalTextPrompt: '',
        placeholderText: null,
        templateId: null,
      });
      expect(parseTypedWidgetConfig('TEXT', { content: '# Notes' })).toEqual({
        kind: 'TEXT',
        content: '# Notes',
      });
      expect(parseTypedWidgetConfig('TEXT', null)).toEqual({
        kind: 'TEXT',
        content: '',
      });

      expect(
        parseTypedWidgetConfig('HTTP', { url: 'https://api.example.com', method: 'POST' }),
      ).toEqual({
        kind: 'HTTP',
        url: 'https://api.example.com',
        method: 'POST',
      });
      expect(parseTypedWidgetConfig('HTTP', {})).toEqual({
        kind: 'HTTP',
        url: '',
        method: 'GET',
      });

      expect(
        parseTypedWidgetConfig('SQL', {
          query: 'SELECT 1',
          allow_natural_text: true,
          processor: 'ollama:llama3',
          natural_text_prompt: 'Count patients',
          placeholder_text: 'Custom hint',
          template_id: 'tmpl-1',
        }),
      ).toEqual({
        kind: 'SQL',
        query: 'SELECT 1',
        allowNaturalText: true,
        processor: 'ollama:llama3',
        naturalTextPrompt: 'Count patients',
        placeholderText: 'Custom hint',
        templateId: 'tmpl-1',
      });

      expect(parseTypedWidgetConfig(null, null)).toEqual({
        kind: 'SQL',
        query: '',
        allowNaturalText: false,
        processor: 'SQL',
        naturalTextPrompt: '',
        placeholderText: null,
        templateId: null,
      });
    });
  });
  describe('narrowRecordPayload, extractExecutionErrorMessage, extractMarkdownContent, extractTabularExportRows', () => {
    it('narrows record payloads and rejects primitives or arrays', () => {
      expect(narrowRecordPayload(null)).toBeNull();
      expect(narrowRecordPayload(undefined)).toBeNull();
      expect(narrowRecordPayload([1, 2])).toBeNull();
      expect(narrowRecordPayload({ a: 1 })).toEqual({ a: 1 });
    });

    it('extracts execution error messages safely', () => {
      expect(extractExecutionErrorMessage(null)).toBeNull();
      expect(extractExecutionErrorMessage({})).toBeNull();
      expect(extractExecutionErrorMessage({ error: '' })).toBeNull();
      expect(extractExecutionErrorMessage({ error: 'SQL failure' })).toBe('SQL failure');
    });

    it('extracts markdown content safely', () => {
      expect(extractMarkdownContent(null)).toBeUndefined();
      expect(extractMarkdownContent({})).toBeUndefined();
      expect(extractMarkdownContent({ content: '# Heading' })).toBe('# Heading');
    });

    it('extracts tabular export rows safely', () => {
      expect(extractTabularExportRows(null)).toEqual([]);
      expect(extractTabularExportRows({ data: 'not-array' })).toEqual([]);
      expect(extractTabularExportRows({ data: [{ a: 1 }, null, [1]] })).toEqual([{ a: 1 }]);
    });
  });

  describe('parseTableDataSet', () => {
    it('returns null when raw is null or undefined', () => {
      expect(parseTableDataSet(null)).toBeNull();
      expect(parseTableDataSet(undefined)).toBeNull();
    });

    it('extracts string columns and object rows and filters invalid entries', () => {
      expect(
        parseTableDataSet({
          columns: ['dept', 42, 'count'],
          data: [{ dept: 'ICU', count: 5 }, null, 'bad'],
        }),
      ).toEqual({
        columns: ['dept', 'count'],
        data: [{ dept: 'ICU', count: 5 }],
      });
    });

    it('defaults columns and data to empty arrays when missing', () => {
      expect(parseTableDataSet({ status: 'ok' })).toEqual({ columns: [], data: [] });
    });
  });

  describe('parseMetricData', () => {
    it('returns undefined when raw is null or undefined', () => {
      expect(parseMetricData(null)).toBeUndefined();
      expect(parseMetricData(undefined)).toBeUndefined();
    });

    it('narrows value, label, trend, and trend_data when present', () => {
      expect(
        parseMetricData({
          value: 42,
          label: 'Admissions',
          trend: 1.5,
          trend_data: [10, 'skip', 20],
        }),
      ).toEqual({
        value: 42,
        label: 'Admissions',
        trend: 1.5,
        trend_data: [10, 20],
      });

      expect(parseMetricData({ value: '98%' })).toEqual({ value: '98%' });
      expect(parseMetricData({ data: [{ v: 1 }] })).toEqual({ data: [{ v: 1 }] });
    });
  });

  describe('parseScalarData', () => {
    it('returns undefined when raw is null or undefined', () => {
      expect(parseScalarData(null)).toBeUndefined();
      expect(parseScalarData(undefined)).toBeUndefined();
    });

    it('narrows numeric value and preserves tabular data', () => {
      expect(parseScalarData({ value: 0.85, columns: ['r'] })).toEqual({
        value: 0.85,
        columns: ['r'],
      });
      expect(parseScalarData({ data: [{ r: 0.5 }] })).toEqual({ data: [{ r: 0.5 }] });
    });
  });

  describe('parseChartConfig', () => {
    it('returns empty object when config is null or undefined', () => {
      expect(parseChartConfig(null)).toEqual({});
      expect(parseChartConfig(undefined)).toEqual({});
    });

    it('extracts xKey, yKey, stackBy, and valid referenceLines', () => {
      expect(
        parseChartConfig({
          xKey: 'unit',
          yKey: 'patients',
          stackBy: 'service',
          referenceLines: [
            { y: 80, label: 'Target', color: '#ff0000', style: 'dashed' },
            { y: 90, style: 'solid' },
            { y: 95, style: 'dotted' },
            { y: 100, style: 'invalid' },
            { label: 'Missing Y' },
            null,
          ],
        }),
      ).toEqual({
        xKey: 'unit',
        yKey: 'patients',
        stackBy: 'service',
        referenceLines: [
          { y: 80, label: 'Target', color: '#ff0000', style: 'dashed' },
          { y: 90, style: 'solid' },
          { y: 95, style: 'dotted' },
          { y: 100 },
        ],
      });
    });
  });
});
