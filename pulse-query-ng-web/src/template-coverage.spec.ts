import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from 'fs';
import { dirname, join, resolve } from 'path';

type TemplateRef = {
  sourceFile: string;
  templatePath: string;
};

const appRoot = resolve(process.cwd(), 'src', 'app');

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
  const tsFiles = walk(appRoot, (file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'));
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
    const htmlFiles = walk(appRoot, (file) => file.endsWith('.html'));
    expect(refs.length).toBe(htmlFiles.length);
    const missing = refs.filter((ref) => !existsSync(ref.templatePath));
    expect(missing).toEqual([]);
  });

  it('ensures every template has a sibling spec file', () => {
    const refs = getTemplateRefs();
    const missing = refs.filter((ref) => !existsSync(ref.templatePath.replace(/\.html$/, '.spec.ts')));
    expect(missing).toEqual([]);
  });

  it('ensures no orphaned component templates exist', () => {
    const htmlFiles = walk(appRoot, (file) => file.endsWith('.html'));
    const orphaned = htmlFiles.filter((file) => !existsSync(file.replace(/\.html$/, '.ts')));
    expect(orphaned).toEqual([]);
  });
});
