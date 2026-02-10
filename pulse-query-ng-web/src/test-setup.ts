/** 
 * @fileoverview Test configuration setup for the Angular application. 
 * This file is the entry point for the test runner (Vitest). 
 * It initializes the Angular testing environment and sets up global browser mocks. 
 */ 

import { TestBed } from '@angular/core/testing'; 
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing'; 
import { ComponentRef, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { ResourceLoader } from '@angular/compiler';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { vi } from 'vitest'; 

/** 
 * Global Mock for `window.matchMedia`. 
 * Fixes generic Material/CDK component instantiation. 
 */ 
if (typeof window !== 'undefined') { 
  Object.defineProperty(window, 'matchMedia', { 
    configurable: true,
    writable: true, 
    value: vi.fn().mockImplementation((query: string) => ({ 
      matches: false, 
      media: query, 
      onchange: null, 
      addListener: vi.fn(), 
      removeListener: vi.fn(), 
      addEventListener: vi.fn(), 
      removeEventListener: vi.fn(), 
      dispatchEvent: vi.fn(), 
    })), 
  }); 
} 

/** 
 * Mock DOM Rect APIs for CodeMirror 6 in JSDOM. 
 */ 
if (typeof Range !== 'undefined') { 
  Range.prototype.getClientRects = () => ({ 
    item: () => null, 
    length: 0, 
    [Symbol.iterator]: [][Symbol.iterator] 
  } as unknown as DOMRectList); 

  Range.prototype.getBoundingClientRect = () => ({ 
    x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, 
    toJSON: () => {} 
  } as DOMRect); 
} 

// Initialize the Angular testing environment
TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

// --- Resource loader for templateUrl/styleUrls in Node/JSDOM ---
const testSetupDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(testSetupDir, '..');
const srcRoot = resolve(appRoot, 'src');
const coverageRoots = new Set([appRoot, process.cwd()]);
for (const root of coverageRoots) {
  mkdirSync(resolve(root, 'coverage', '.tmp'), { recursive: true });
}

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

const resourceLoader = new FsResourceLoader();

TestBed.configureCompiler({
  providers: [{ provide: ResourceLoader, useValue: resourceLoader }]
});

let componentsNeedingResources: Array<unknown> = [];

beforeAll(async () => {
  const [
    { ToolbarComponent },
    { DashboardLayoutComponent },
    { TemplateWizardComponent },
    { WidgetBuilderComponent },
    { ScenarioEditorComponent }
  ] = await Promise.all([
    import('./app/dashboard/toolbar.component'),
    import('./app/dashboard/dashboard-layout.component'),
    import('./app/dashboard/template-wizard/template-wizard.component'),
    import('./app/dashboard/widget-builder/widget-builder.component'),
    import('./app/simulation/scenario-editor/scenario-editor.component')
  ]);

  componentsNeedingResources = [
    ToolbarComponent,
    DashboardLayoutComponent,
    TemplateWizardComponent,
    WidgetBuilderComponent,
    ScenarioEditorComponent
  ];
  componentsNeedingResources.forEach((cmp) => void cmp);
});

beforeEach(async () => {
  TestBed.configureCompiler({
    providers: [{ provide: ResourceLoader, useValue: resourceLoader }]
  });
  await resolveComponentResources((url) => Promise.resolve(resourceLoader.get(url)));
});

// --- Signal input compatibility for JIT tests ---
// Angular's JIT compiler does not understand `input()` metadata, so `setInput`
// throws for signal inputs. Patch setInput to fall back to writing via the
// internal signal node when available.
const originalSetInput = ComponentRef.prototype.setInput;
ComponentRef.prototype.setInput = function(name: string, value: unknown) {
  try {
    return originalSetInput.call(this, name, value);
  } catch (err) {
    const instance = (this as ComponentRef<any>).instance as Record<string, any> | undefined;
    if (instance && Object.prototype.hasOwnProperty.call(instance, name)) {
      const current = instance[name];
      if (typeof current === 'function') {
        const node = (current as any)[SIGNAL];
        if (node) {
          if (typeof node.applyValueToInputSignal === 'function') {
            node.applyValueToInputSignal(node, value);
          } else {
            signalSetFn(node, value);
          }
          return;
        }
      } else {
        instance[name] = value;
      }
      return;
    }
    throw err;
  }
};
