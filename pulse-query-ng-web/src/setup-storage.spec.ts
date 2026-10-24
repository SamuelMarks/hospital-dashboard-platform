/**
 * @fileoverview Unit tests for `setup-storage.ts` in-memory storage mock.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockStorage } from './setup-storage';

describe('setup-storage', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('stores, retrieves, removes, and clears items in mockStorage', () => {
    expect(mockStorage.getItem('missing')).toBeNull();

    mockStorage.setItem('token', 'abc-123');
    expect(mockStorage.getItem('token')).toBe('abc-123');

    mockStorage.removeItem('token');
    expect(mockStorage.getItem('token')).toBeNull();

    mockStorage.setItem('k1', 'v1');
    mockStorage.clear();
    expect(mockStorage.getItem('k1')).toBeNull();
  });
});
