/**
 * @fileoverview Test configuration setup for the Angular application.
 * This file is the entry point for the test runner (Vitest).
 * It initializes the Angular testing environment and sets up global browser mocks.
 */

import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { ComponentRef } from '@angular/core';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { ResourceLoader } from '@angular/compiler';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { vi } from 'vitest';
import {
  resourceLoader,
  resolveComponentResourcesForTests,
} from './test-utils/component-resources';

// Global mock to avoid ESM resolution issues in Node for material-color-utilities.
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({
    schemes: {
      light: new Proxy({}, { get: () => 0xffffffff }),
      dark: new Proxy({}, { get: () => 0xffffffff }),
    },
  }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

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
  Range.prototype.getClientRects = () =>
    ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;

  Range.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => {},
    }) as DOMRect;
}

// Initialize the Angular testing environment
TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

// --- Resource loader for templateUrl/styleUrls in Node/JSDOM ---
const testSetupDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(testSetupDir, '..');
const coverageRoots = new Set([appRoot, process.cwd()]);
for (const root of coverageRoots) {
  mkdirSync(resolve(root, 'coverage', '.tmp'), { recursive: true });
}

TestBed.configureCompiler({
  providers: [{ provide: ResourceLoader, useValue: resourceLoader }],
});

let componentsNeedingResources: Array<unknown> = [];

beforeAll(async () => {
  const [
    { ToolbarComponent },
    { DashboardLayoutComponent },
    { TemplateWizardComponent },
    { WidgetBuilderComponent },
    { ScenarioEditorComponent },
  ] = await Promise.all([
    import('./app/dashboard/toolbar.component'),
    import('./app/dashboard/dashboard-layout.component'),
    import('./app/dashboard/template-wizard/template-wizard.component'),
    import('./app/dashboard/widget-builder/widget-builder.component'),
    import('./app/simulation/scenario-editor/scenario-editor.component'),
  ]);

  componentsNeedingResources = [
    ToolbarComponent,
    DashboardLayoutComponent,
    TemplateWizardComponent,
    WidgetBuilderComponent,
    ScenarioEditorComponent,
  ];
  componentsNeedingResources.forEach((cmp) => void cmp);
});

beforeEach(async () => {
  TestBed.configureCompiler({
    providers: [{ provide: ResourceLoader, useValue: resourceLoader }],
  });
  await resolveComponentResourcesForTests();
});

const originalCompileComponents = TestBed.compileComponents.bind(TestBed);
TestBed.compileComponents = async () => {
  await resolveComponentResourcesForTests();
  return originalCompileComponents();
};

// --- Signal input compatibility for JIT tests ---
// Angular's JIT compiler does not understand `input()` metadata, so `setInput`
// throws for signal inputs. Patch setInput to fall back to writing via the
// internal signal node when available.
const originalSetInput = ComponentRef.prototype.setInput;
ComponentRef.prototype.setInput = function (name: string, value: unknown) {
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
