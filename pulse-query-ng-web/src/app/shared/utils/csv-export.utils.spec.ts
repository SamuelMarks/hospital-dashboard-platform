/**
 * @fileoverview Unit tests for CSV serialization and Blob download utilities.
 */

import { describe, it, expect, vi } from 'vitest';
import { serializeTableToCsv, triggerBlobDownload } from './csv-export.utils';

describe('csv-export.utils', () => {
  it('serializes rows with explicit or inferred columns and escapes quotes', () => {
    expect(serializeTableToCsv([])).toBe('');
    expect(serializeTableToCsv([{}], [])).toBe('');

    const nl = String.fromCharCode(10);
    const rows = [{ unit: 'ICU "A"', census: 12, empty: null }];
    const csvExplicit = serializeTableToCsv(rows, ['unit', 'census', 'empty']);
    expect(csvExplicit).toBe(`unit,census,empty${nl}"ICU ""A""","12",""`);

    const csvInferred = serializeTableToCsv(rows);
    expect(csvInferred).toBe(`unit,census,empty${nl}"ICU ""A""","12",""`);
  });

  it('triggers blob download with and without appending to document.body', () => {
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-1');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const blob = new Blob(['a,b'], { type: 'text/csv' });

    triggerBlobDownload(document, blob, 'test.csv', false);
    triggerBlobDownload(document, blob, 'test2.csv', true);

    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-1');
    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });
});
