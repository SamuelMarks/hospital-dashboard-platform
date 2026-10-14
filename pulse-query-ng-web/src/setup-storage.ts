/**
 * @fileoverview Vitest global setup for in-memory localStorage and sessionStorage mocks.
 */

import { vi } from 'vitest';

/** In-memory storage implementation used during unit testing. */
const mockStorage = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null;
  },
  setItem(key: string, value: string) {
    this.store[key] = value.toString();
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
};

vi.stubGlobal('localStorage', mockStorage);
vi.stubGlobal('sessionStorage', mockStorage);
