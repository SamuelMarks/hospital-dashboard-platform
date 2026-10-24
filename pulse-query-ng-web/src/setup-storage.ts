/**
 * @fileoverview Vitest global setup for in-memory localStorage and sessionStorage mocks.
 */

import { vi } from 'vitest';

/**
 * Interface representing the in-memory storage mock used during unit testing.
 */
export interface MockStorage {
  /** Key-value dictionary backing the in-memory storage. */
  store: Record<string, string>;
  /**
   * Retrieves a stored string value by key.
   *
   * @param key - Storage key to look up.
   * @returns Stored value or `null` when absent.
   */
  getItem(key: string): string | null;
  /**
   * Persists a key-value pair in the in-memory store.
   *
   * @param key - Storage key to write.
   * @param value - Value converted to string and stored.
   */
  setItem(key: string, value: string): void;
  /**
   * Deletes a key from the in-memory store.
   *
   * @param key - Storage key to remove.
   */
  removeItem(key: string): void;
  /**
   * Clears all keys from the in-memory store.
   */
  clear(): void;
}

/** In-memory storage implementation used during unit testing. */
export const mockStorage: MockStorage = {
  /** Backing key-value store. */
  store: {} as Record<string, string>,
  /**
   * Retrieves a stored string value by key.
   *
   * @param key - Storage key to look up.
   * @returns Stored value or `null` when absent.
   */
  getItem(key: string): string | null {
    return this.store[key] || null;
  },
  /**
   * Persists a key-value pair in the in-memory store.
   *
   * @param key - Storage key to write.
   * @param value - Value converted to string and stored.
   */
  setItem(key: string, value: string): void {
    this.store[key] = value.toString();
  },
  /**
   * Deletes a key from the in-memory store.
   *
   * @param key - Storage key to remove.
   */
  removeItem(key: string): void {
    delete this.store[key];
  },
  /**
   * Clears all keys from the in-memory store.
   */
  clear(): void {
    this.store = {};
  },
};

vi.stubGlobal('localStorage', mockStorage);
vi.stubGlobal('sessionStorage', mockStorage);
