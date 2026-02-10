import { ResourceLoader } from '@angular/compiler';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

/** Absolute path to the test-utils directory. */
const testUtilsDir = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the application root. */
const appRoot = resolve(testUtilsDir, '..', '..');
/** Absolute path to the application's src directory. */
const srcRoot = resolve(appRoot, 'src');

/** Resource loader that resolves component resources from disk for tests. */
class FsResourceLoader extends ResourceLoader {
  /** Cached resource contents keyed by the requested URL. */
  private readonly cache = new Map<string, string>();
  /** Cached resolved file paths keyed by basename; null means missing. */
  private readonly nameCache = new Map<string, string | null>();

  /** Resolve a resource URL into its file contents. */
  get(url: string): string {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    if (url.endsWith('.scss') || url.endsWith('.sass')) {
      this.cache.set(url, '');
      return '';
    }

    const directCandidates = [
      resolve(appRoot, url),
      resolve(appRoot, 'src', url),
      resolve(appRoot, 'src', 'app', url)
    ];

    let filePath = directCandidates.find(existsSync);

    if (!filePath) {
      const targetName = basename(url);
      if (this.nameCache.has(targetName)) {
        filePath = this.nameCache.get(targetName) || undefined;
      } else {
        filePath = findFirstFile(srcRoot, targetName);
        this.nameCache.set(targetName, filePath ?? null);
      }
    }

    if (!filePath) {
      throw new Error(`Resource not found: ${url}`);
    }

    const contents = readFileSync(filePath, 'utf-8');
    this.cache.set(url, contents);
    return contents;
  }
}

/** Recursively search for the first matching file name under a directory. */
function findFirstFile(rootDir: string, fileName: string): string | undefined {
  const entries = readdirSync(rootDir);
  for (const entry of entries) {
    const fullPath = join(rootDir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      const found = findFirstFile(fullPath, fileName);
      if (found) return found;
    } else if (entry === fileName) {
      return fullPath;
    }
  }
  return undefined;
}

/** Shared loader instance used by the test environment. */
export const resourceLoader = new FsResourceLoader();

/** Resolve component resources using the test resource loader. */
export const resolveComponentResourcesForTests = () =>
  resolveComponentResources((url) => Promise.resolve(resourceLoader.get(url)));

/** Read a component template as a string via the test resource loader. */
export const readTemplate = (url: string) => resourceLoader.get(url);
