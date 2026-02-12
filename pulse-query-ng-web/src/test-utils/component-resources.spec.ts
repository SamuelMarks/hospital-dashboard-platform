import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { resourceLoader, readTemplate } from './component-resources';

describe('component-resources', () => {
  it('returns empty content for scss and sass resources', () => {
    expect(resourceLoader.get('styles.scss')).toBe('');
    expect(resourceLoader.get('styles.sass')).toBe('');
  });

  it('resolves templates by filename and caches by basename', () => {
    const first = readTemplate('ask-data.component.html');
    const loader = resourceLoader as unknown as { nameCache: Map<string, string> };
    const specDir = dirname(fileURLToPath(import.meta.url));
    const askDataCandidates = [
      resolve(specDir, '..', 'app', 'global', 'ask-data.component.html'),
      resolve(specDir, '..', 'src', 'app', 'global', 'ask-data.component.html'),
      resolve(process.cwd(), 'src', 'app', 'global', 'ask-data.component.html'),
      resolve(process.cwd(), 'pulse-query-ng-web', 'src', 'app', 'global', 'ask-data.component.html')
    ];
    const askDataPath = askDataCandidates.find((path) => existsSync(path));
    if (!askDataPath) {
      throw new Error(`Unable to locate ask-data.component.html from ${specDir}`);
    }
    loader.nameCache.set('ask-data.component.html', askDataPath);
    const second = resourceLoader.get('cache-buster/ask-data.component.html');

    expect(first.length).toBeGreaterThan(0);
    expect(second).toBe(first);
  });

  it('throws when a resource cannot be found', () => {
    const missingName = '__vitest_missing_component_resources__.html';
    expect(() => resourceLoader.get(missingName)).toThrow('Resource not found');
    expect(() => resourceLoader.get(`missing-path/${missingName}`)).toThrow('Resource not found');
  });
});
