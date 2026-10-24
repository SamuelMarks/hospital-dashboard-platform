/**
 * @fileoverview Filesystem-backed Angular component resource loader for Vitest unit tests.
 * Resolves external `templateUrl` and `styleUrls` declarations from disk during test runs.
 */

import { ResourceLoader } from '@angular/compiler';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

/** Directory containing the test-utils helper modules. */
const testUtilsDir = dirname(fileURLToPath(import.meta.url));
/** Resolved Angular application root directory path (`pulse-query-ng-web`). */
const appRoot = resolve(testUtilsDir, '..', '..');
/** Resolved `src/` directory path within the Angular application root. */
const srcRoot = resolve(appRoot, 'src');

/**
 * Recursively searches a directory tree for the first file matching `fileName`.
 *
 * @param rootDir - Root directory path to search within.
 * @param fileName - Basename of the target file to locate.
 * @returns Full path to the first matching file, or `undefined` when not found.
 */
export function findFirstFile(rootDir: string, fileName: string): string | undefined {
  if (!existsSync(rootDir)) {
    return undefined;
  }
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

/**
 * Synchronous filesystem implementation of Angular's `ResourceLoader` for unit tests.
 */
class FsResourceLoader extends ResourceLoader {
  /** Cache mapping requested template URLs to their loaded file contents. */
  private readonly cache = new Map<string, string>();
  /** Cache mapping file basenames to their resolved absolute filesystem paths. */
  readonly nameCache = new Map<string, string | null>();

  /**
   * Loads the content of a component template or stylesheet resource from disk.
   *
   * @param url - Relative resource URL declared in a component decorator.
   * @returns Raw UTF-8 text content of the template, or an empty string for stylesheets.
   */
  get(url: string): string {
    const cached = this.cache.get(url);
    if (cached !== undefined) {
      return cached;
    }

    if (url.endsWith('.scss') || url.endsWith('.sass')) {
      this.cache.set(url, '');
      return '';
    }

    const directCandidates = [
      resolve(appRoot, url),
      resolve(appRoot, 'src', url),
      resolve(appRoot, 'src', 'app', url),
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

/** Shared singleton instance of the filesystem resource loader. */
export const resourceLoader = new FsResourceLoader();

/**
 * Resolves all pending Angular component resources using the filesystem loader.
 *
 * @returns Promise that resolves once all component templates are loaded.
 */
export function resolveComponentResourcesForTests(): Promise<void> {
  return resolveComponentResources((url) => Promise.resolve(resourceLoader.get(url)));
}

/**
 * Reads a template file synchronously by URL via the shared resource loader.
 *
 * @param url - Relative path or filename of the template resource.
 * @returns UTF-8 string contents of the template file.
 */
export function readTemplate(url: string): string {
  return resourceLoader.get(url);
}
