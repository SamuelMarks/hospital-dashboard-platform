/**
 * In-memory storage implementation for fallback environments.
 *
 * @returns An in-memory Storage compliant instance.
 */
export function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (idx: number) => Object.keys(store)[idx] || null,
  } as Storage;
}

/**
 * Resolves safe local storage with automatic fallback.
 *
 * @returns Available window storage or memory storage fallback.
 */
export function getSafeStorage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Fallback on security/access error
  }
  return createMemoryStorage();
}

/** Safe storage utility instance. */
export const safeStorage = getSafeStorage();
