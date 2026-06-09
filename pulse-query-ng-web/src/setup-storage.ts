import { vi } from 'vitest';

/** Mock storage. */ const mockStorage = {
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
