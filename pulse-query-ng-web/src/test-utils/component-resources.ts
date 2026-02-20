// pulse-query-ng-web/src/test-utils/component-resources.ts
import { ResourceLoader } from '@angular/compiler';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const testUtilsDir = dirname(fileURLToPath(import.meta.url));

function isAppRoot(dir: string): boolean {
  return existsSync(join(dir, 'src', 'app')) && existsSync(join(dir, 'package.json'));
}

function findAppRoot(startDir: string): string | undefined {
  let current = startDir;
  while (true) {
    /* v8 ignore next */
    if (isAppRoot(current)) {
      return current;
    }
    const parent = dirname(current);
    /* v8 ignore next */
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
  /* v8 ignore next */
  (isAppRoot(cwd) ? cwd : undefined) ??
  /* v8 ignore next */
  (isAppRoot(nestedCwd) ? nestedCwd : cwd);
const srcRoot = resolve(appRoot, 'src');

class FsResourceLoader extends ResourceLoader {
  private readonly cache = new Map<string, string>();
  private readonly nameCache = new Map<string, string | null>();

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

    /* v8 ignore next */
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

function findFirstFile(rootDir: string, fileName: string): string | undefined {
  /* v8 ignore next */
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

export const resourceLoader = new FsResourceLoader();

export const resolveComponentResourcesForTests = () =>
  resolveComponentResources((url) => Promise.resolve(resourceLoader.get(url)));

export const readTemplate = (url: string) => resourceLoader.get(url);
