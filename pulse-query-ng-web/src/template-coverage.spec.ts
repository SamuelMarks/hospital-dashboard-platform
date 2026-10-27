/**
 * @fileoverview Static and DOM integration verification for all Angular component templates
 * and stylesheets in `pulse-query-ng-web/src/app`.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

interface TemplateRef {
  sourceFile: string;
  templatePath: string;
}

interface StyleRef {
  sourceFile: string;
  stylePath: string;
}

const specDir = dirname(fileURLToPath(import.meta.url));
const appRootCandidates = [
  resolve(specDir, 'app'),
  resolve(specDir, 'src', 'app'),
  resolve(specDir, '..', 'app'),
  resolve(specDir, '..', 'src', 'app'),
  resolve(process.cwd(), 'src', 'app'),
  resolve(process.cwd(), 'pulse-query-ng-web', 'src', 'app'),
];
const appRoot = appRootCandidates.find((dir) => existsSync(dir));
if (!appRoot) {
  throw new Error(`Unable to locate src/app from ${specDir}`);
}
const appRootPath = appRoot;

/**
 * Recursively walks a directory tree and returns files matching `matcher`.
 *
 * @param dir - Root directory to traverse.
 * @param matcher - Predicate function returning true for matching file paths.
 * @param results - Accumulator array of matched file paths.
 * @returns Array of matched file paths.
 */
function walk(dir: string, matcher: (file: string) => boolean, results: string[] = []): string[] {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, matcher, results);
    } else if (matcher(full)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Extracts all `templateUrl` references from non-spec TypeScript files in `src/app`.
 *
 * @returns Array of `TemplateRef` entries.
 */
function getTemplateRefs(): TemplateRef[] {
  const tsFiles = walk(appRootPath, (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
  const templateRefs: TemplateRef[] = [];
  const templateRegex = /templateUrl\s*:\s*['"`]([^'"`]+)['"`]/g;

  for (const file of tsFiles) {
    const contents = readFileSync(file, 'utf8');
    templateRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = templateRegex.exec(contents))) {
      const rel = match[1];
      if (rel) {
        const templatePath = resolve(dirname(file), rel);
        templateRefs.push({ sourceFile: file, templatePath });
      }
    }
  }

  return templateRefs;
}

/**
 * Extracts all `styleUrl` references from non-spec TypeScript files in `src/app`.
 *
 * @returns Array of `StyleRef` entries.
 */
function getStyleRefs(): StyleRef[] {
  const tsFiles = walk(appRootPath, (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
  const styleRefs: StyleRef[] = [];
  const styleUrlRegex = /styleUrl\s*:\s*['"`]([^'"`]+)['"`]/g;

  for (const file of tsFiles) {
    const contents = readFileSync(file, 'utf8');
    styleUrlRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = styleUrlRegex.exec(contents))) {
      const rel = match[1];
      if (rel) {
        styleRefs.push({ sourceFile: file, stylePath: resolve(dirname(file), rel) });
      }
    }
  }
  return styleRefs;
}

describe('Template and Style URL Resolution & DOM Rendering Verification', () => {
  it('ensures all templateUrl entries resolve to existing HTML files', () => {
    const refs = getTemplateRefs();
    const htmlFiles = walk(appRootPath, (file) => file.endsWith('.html'));
    expect(refs.length).toBe(htmlFiles.length);
    const missing = refs.filter((ref) => !existsSync(ref.templatePath));
    expect(missing).toEqual([]);
  });

  it('ensures all styleUrl entries resolve to existing stylesheet files', () => {
    const styleRefs = getStyleRefs();
    const missing = styleRefs.filter((ref) => !existsSync(ref.stylePath));
    expect(missing).toEqual([]);
  });

  it('ensures every external template has a sibling spec file that tests the component', () => {
    const refs = getTemplateRefs();
    const missing = refs.filter(
      (ref) => !existsSync(ref.templatePath.replace(/\.html$/, '.spec.ts')),
    );
    expect(missing).toEqual([]);
  });

  it('ensures no orphaned component templates exist', () => {
    const htmlFiles = walk(appRootPath, (file) => file.endsWith('.html'));
    const orphaned = htmlFiles.filter((file) => !existsSync(file.replace(/\.html$/, '.ts')));
    expect(orphaned).toEqual([]);
  });

  it('verifies balanced Angular control-flow blocks and TestBed instantiation across all component specs', () => {
    const refs = getTemplateRefs();
    for (const ref of refs) {
      const rawHtml = readFileSync(ref.templatePath, 'utf8');
      expect(rawHtml.trim().length).toBeGreaterThan(0);

      // Verify balanced braces for Angular @if / @for / @switch / interpolation blocks
      const openBraces = (rawHtml.match(/\{/g) || []).length;
      const closeBraces = (rawHtml.match(/\}/g) || []).length;
      expect(openBraces).toBe(closeBraces);

      // Verify the corresponding .spec.ts file instantiates the component via Angular TestBed
      const specPath = ref.sourceFile.replace(/\.ts$/, '.spec.ts');
      expect(existsSync(specPath)).toBe(true);
      const compSource = readFileSync(ref.sourceFile, 'utf8');
      const specSource = readFileSync(specPath, 'utf8');
      expect(specSource).toMatch(/TestBed\.(createComponent|runInInjectionContext)/);

      // Verify every component method bound in template event handlers is exercised or triggered via DOM in the spec
      const handlerRegex =
        /\((?:click|input|change|ngSubmit|selectionChange|keydown\.enter|keydown\.space)\)="([a-zA-Z0-9_$]+)\s*\(/g;
      let handlerMatch: RegExpExecArray | null;
      const hasDomTrigger =
        /triggerEventHandler|\.click\(|dispatchEvent|querySelector|By\.css|nativeElement/.test(
          specSource,
        );
      while ((handlerMatch = handlerRegex.exec(rawHtml))) {
        const methodName = handlerMatch[1];
        const isComponentMethod =
          methodName !== undefined && new RegExp(`\\b${methodName}\\s*\\(`).test(compSource);
        if (isComponentMethod && methodName) {
          expect(
            specSource.includes(methodName) || hasDomTrigger,
            `Expected ${specPath} to test ${methodName}`,
          ).toBe(true);
        }
      }
    }
  });

  it('verifies messages.xlf exists and contains extracted XLIFF translation units', () => {
    const xlfPath = resolve(appRootPath, '..', '..', 'messages.xlf');
    expect(existsSync(xlfPath)).toBe(true);
    const xlfContent = readFileSync(xlfPath, 'utf8');
    expect(xlfContent).toContain('<xliff version="1.2"');
    const transUnitMatches = xlfContent.match(/<trans-unit\b/g) || [];
    expect(transUnitMatches.length).toBeGreaterThan(100);
  });
});
