import { createMemoryStorage, getSafeStorage, safeStorage } from './storage.utils';
import { describe, expect, it, vi } from 'vitest';

describe('storage.utils', () => {
  it('should support in-memory storage fallback', () => {
    const mem = createMemoryStorage();
    expect(mem.getItem('unknown')).toBeNull();
    mem.setItem('a', 'valA');
    expect(mem.getItem('a')).toBe('valA');
    expect(mem.length).toBe(1);
    expect(mem.key(0)).toBe('a');
    expect(mem.key(99)).toBeNull();

    mem.removeItem('a');
    expect(mem.getItem('a')).toBeNull();

    mem.setItem('b', 'valB');
    mem.clear();
    expect(mem.length).toBe(0);
  });

  it('should resolve getSafeStorage and handle exceptions', () => {
    const storage = getSafeStorage();
    expect(storage).toBeDefined();

    // Mock localStorage throwing
    const originalLocalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Access denied');
      },
      configurable: true,
    });

    const fallbackStorage = getSafeStorage();
    expect(fallbackStorage).toBeDefined();
    fallbackStorage.setItem('fallback_k', '123');
    expect(fallbackStorage.getItem('fallback_k')).toBe('123');

    // Restore
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
    });
  });

  it('should export singleton safeStorage instance', () => {
    expect(safeStorage).toBeDefined();
  });
});
