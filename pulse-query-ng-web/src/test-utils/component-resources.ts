/**
 * @fileoverview Filesystem-backed Angular component resource loader for Vitest unit tests.
 * Resolves external `templateUrl` and `styleUrls` declarations from disk during test runs.
 */

import { ResourceLoader } from '@angular/compiler';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const testUtilsDir = dirname(fileURLToPath(import.meta.url));

/**
 * Checks whether a directory path corresponds to the Angular application root.
 *
 * @param dir - Directory path to inspect.
 * @returns True if the directory contains both `src/app` and `package.json`.
 */
function isAppRoot(dir: string): boolean {
  return existsSync(join(dir, 'src', 'app')) && existsSync(join(dir, 'package.json'));
}

/**
 * Walks up the directory tree from `startDir` to locate the Angular project root.
 *
 * @param startDir - Initial directory path from which to search upward.
 * @returns Resolved application root directory path, or `undefined` if not found.
 */
function findAppRoot(startDir: string): string | undefined {
  let current = startDir;
  while (true) {
    if (isAppRoot(current)) {
      return current;
    }
    const parent = dirname(current);

    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

const cwd = process.cwd();
const nestedCwd = resolve(cwd, 'pulse-query-ng-web');
const appRoot =
  findAppRoot(testUtilsDir) ??
  (isAppRoot(cwd) ? cwd : undefined) ??
  (isAppRoot(nestedCwd) ? nestedCwd : cwd);
const srcRoot = resolve(appRoot, 'src');

/**
 * Synchronous filesystem implementation of Angular's `ResourceLoader` for unit tests.
 */
class FsResourceLoader extends ResourceLoader {
  /** Cache mapping requested template URLs to their loaded file contents. */
  private readonly cache = new Map<string, string>();
  /** Cache mapping file basenames to their resolved absolute filesystem paths. */
  private readonly nameCache = new Map<string, string | null>();

  /**
   * Loads the content of a component template or stylesheet resource from disk.
   *
   * @param url - Relative resource URL declared in a component decorator.
   * @returns Raw UTF-8 text content of the template, or an empty string for stylesheets.
   */
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

/**
 * Recursively searches a directory tree for the first file matching `fileName`.
 *
 * @param rootDir - Root directory path to search within.
 * @param fileName - Basename of the target file to locate.
 * @returns Full path to the first matching file, or `undefined` when not found.
 */
function findFirstFile(rootDir: string, fileName: string): string | undefined {
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

/** Shared singleton instance of the filesystem resource loader. */
export const resourceLoader = new FsResourceLoader();

/**
 * Resolves all pending Angular component resources using the filesystem loader.
 *
 * @returns Promise that resolves once all component templates are loaded.
 */
export const resolveComponentResourcesForTests = () =>
  resolveComponentResources((url) => Promise.resolve(resourceLoader.get(url)));

/**
 * Reads a template file synchronously by URL via the shared resource loader.
 *
 * @param url - Relative path or filename of the template resource.
 * @returns UTF-8 string contents of the template file.
 */
export const readTemplate = (url: string) => resourceLoader.get(url);
