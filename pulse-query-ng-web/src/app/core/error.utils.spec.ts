/**
 * @fileoverview Unit tests for `extractApiErrorMessage` in `error.utils.ts`.
 */

import { HttpErrorResponse } from '@angular/common/http';
import { extractApiErrorMessage } from './error.utils';

describe('extractApiErrorMessage', () => {
  it('extracts string detail from HttpErrorResponse', () => {
    const err = new HttpErrorResponse({
      error: { detail: 'SQL syntax error near FROM' },
      status: 400,
    });
    expect(extractApiErrorMessage(err)).toBe('SQL syntax error near FROM');
  });

  it('stringifies non-string detail from HttpErrorResponse', () => {
    const err = new HttpErrorResponse({
      error: { detail: [{ loc: ['body'], msg: 'invalid' }] },
      status: 422,
    });
    expect(extractApiErrorMessage(err)).toBe('[{"loc":["body"],"msg":"invalid"}]');
  });

  it('falls back to HttpErrorResponse.message or fallback when detail is absent', () => {
    const err = new HttpErrorResponse({ error: {}, status: 500, statusText: 'Server Error' });
    expect(extractApiErrorMessage(err)).toContain('Http failure response');

    const emptyMsgErr = Object.create(HttpErrorResponse.prototype) as HttpErrorResponse;
    Object.assign(emptyMsgErr, { error: null, message: '' });
    expect(extractApiErrorMessage(emptyMsgErr, 'Custom fallback')).toBe('Custom fallback');
  });

  it('extracts message from standard Error instances and falls back on empty message', () => {
    expect(extractApiErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(extractApiErrorMessage(new Error(''), 'Default Err')).toBe('Default Err');
  });

  it('extracts detail or message from plain error objects', () => {
    expect(extractApiErrorMessage({ error: { detail: 'Plain detail' } })).toBe('Plain detail');
    expect(extractApiErrorMessage({ error: { detail: { code: 12 } } })).toBe('{"code":12}');
    expect(extractApiErrorMessage({ message: 'Plain message' })).toBe('Plain message');
    expect(extractApiErrorMessage({ message: '   ' }, 'Fallback')).toBe('Fallback');
  });

  it('returns fallback for primitives and nullish values', () => {
    expect(extractApiErrorMessage(null)).toBe('An unexpected error occurred');
    expect(extractApiErrorMessage(undefined, 'Custom')).toBe('Custom');
    expect(extractApiErrorMessage(42, 'Custom')).toBe('Custom');
  });
});
