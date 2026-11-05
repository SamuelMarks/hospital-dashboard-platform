/**
 * @fileoverview Unit tests for the `DATE_NOW` injection token (`time.token.ts`).
 */

import { TestBed } from '@angular/core/testing';
import { DATE_NOW, parseIsoDate, parseTimestampMillis } from './time.token';
import { describe, expect, it } from 'vitest';

describe('DATE_NOW token and date parsing utilities', () => {
  it('should provide factory returning current date', () => {
    const getDate = TestBed.inject(DATE_NOW);
    expect(getDate).toBeInstanceOf(Function);
    const d = getDate();
    expect(d).toBeInstanceOf(Date);
  });

  it('parses ISO dates and timestamps or returns null for empty values', () => {
    expect(parseIsoDate(null)).toBeNull();
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    const parsed = parseIsoDate('2026-05-01T00:00:00Z');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(parseTimestampMillis('2026-05-01T00:00:00Z')).toBe(Date.parse('2026-05-01T00:00:00Z'));
  });
});
