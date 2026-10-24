/**
 * @fileoverview Unit tests for `component-resources.ts` filesystem template loader.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  findFirstFile,
  resourceLoader,
  readTemplate,
  resolveComponentResourcesForTests,
} from './component-resources';

describe('component-resources', () => {
  it('returns empty content for scss and sass resources and caches them', () => {
    expect(resourceLoader.get('styles.scss')).toBe('');
    expect(resourceLoader.get('styles.scss')).toBe('');
    expect(resourceLoader.get('styles.sass')).toBe('');
  });

  it('resolves templates by filename and caches by basename', () => {
    const first = readTemplate('ask-data.component.html');
    const second = readTemplate('ask-data.component.html');
    expect(second).toBe(first);

    const specDir = dirname(fileURLToPath(import.meta.url));
    const askDataPath = resolve(specDir, '..', 'app', 'global', 'ask-data.component.html');
    expect(existsSync(askDataPath)).toBe(true);

    resourceLoader.nameCache.set('ask-data.component.html', askDataPath);
    const third = resourceLoader.get('cache-buster/ask-data.component.html');

    expect(first.length).toBeGreaterThan(0);
    expect(third).toBe(first);
  });

  it('throws when a resource cannot be found and returns undefined for missing rootDir', () => {
    expect(findFirstFile('/non-existent-root-dir-xyz', 'missing.html')).toBeUndefined();
    const missingName = '__vitest_missing_component_resources__.html';
    expect(() => resourceLoader.get(missingName)).toThrow('Resource not found');
    expect(() => resourceLoader.get(`missing-path/${missingName}`)).toThrow('Resource not found');
  });

  it('resolves component resources with the shared loader', async () => {
    await resolveComponentResourcesForTests();
    expect(true).toBe(true);
  });
});
