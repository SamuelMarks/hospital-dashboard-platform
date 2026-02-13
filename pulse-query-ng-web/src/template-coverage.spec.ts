import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

type TemplateRef = {
  sourceFile: string;
  templatePath: string;
};

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

function getTemplateRefs(): TemplateRef[] {
  const tsFiles = walk(appRootPath, (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
  const templateRefs: TemplateRef[] = [];
  const templateRegex = /templateUrl\s*:\s*['"`]([^'"`]+)['"`]/g;

  for (const file of tsFiles) {
    const contents = readFileSync(file, 'utf8');
    templateRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = templateRegex.exec(contents))) {
      const templatePath = resolve(dirname(file), match[1]);
      templateRefs.push({ sourceFile: file, templatePath });
    }
  }

  return templateRefs;
}

describe('Template coverage', () => {
  it('ensures all templateUrl entries resolve to files', () => {
    const refs = getTemplateRefs();
    const htmlFiles = walk(appRootPath, (file) => file.endsWith('.html'));
    expect(refs.length).toBe(htmlFiles.length);
    const missing = refs.filter((ref) => !existsSync(ref.templatePath));
    expect(missing).toEqual([]);
  });

  it('ensures every template has a sibling spec file', () => {
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
});
