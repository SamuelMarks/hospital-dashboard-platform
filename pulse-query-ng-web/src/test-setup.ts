/**
 * @fileoverview Test configuration setup for the Angular application.
 * This file is the entry point for the test runner (Vitest).
 * It initializes the Angular testing environment and sets up global browser mocks.
 */

import '@angular/localize/init';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { ComponentRef, Input, Output, ViewChild } from '@angular/core';
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
  Range.prototype.getClientRects = (): DOMRectList =>
    document.createElement('div').getClientRects();

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
      toJSON: () => ({}),
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

let componentsNeedingResources: unknown[] = [];

beforeAll(async () => {
  const [
    { ToolbarComponent },
    { DashboardLayoutComponent },
    { TemplateWizardComponent },
    { WidgetBuilderComponent },
  ] = await Promise.all([
    import('./app/dashboard/toolbar.component'),
    import('./app/dashboard/dashboard-layout.component'),
    import('./app/dashboard/template-wizard/template-wizard.component'),
    import('./app/dashboard/widget-builder/widget-builder.component'),
  ]);

  componentsNeedingResources = [
    ToolbarComponent,
    DashboardLayoutComponent,
    TemplateWizardComponent,
    WidgetBuilderComponent,
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
TestBed.compileComponents = async (): Promise<void> => {
  await resolveComponentResourcesForTests();
  await originalCompileComponents();
};

// --- Signal input/output/viewChild compatibility for JIT tests ---
const PROP_METADATA_KEY = '__prop__metadata__';
const SIGNAL_PROP_CACHE = Symbol('SIGNAL_PROP_CACHE');

Object.defineProperty(Function.prototype, 'propMetadata', {
  configurable: true,
  get() {
    if (typeof this !== 'function' || this === Function.prototype || this === Object) {
      return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(this, SIGNAL_PROP_CACHE)) {
      return Reflect.get(this, SIGNAL_PROP_CACHE) as unknown;
    }

    const existingMeta = Object.prototype.hasOwnProperty.call(this, PROP_METADATA_KEY)
      ? (Reflect.get(this, PROP_METADATA_KEY) as Record<string, unknown[]>)
      : {};
    const baseMeta: Record<string, unknown[]> = { ...existingMeta };

    const src = Function.prototype.toString.call(this);
    // Match `prop = ...input(...)`, `this.prop = ...input(...)`, or `(0,__vite_ssr_import_0__.input)(...)`
    const inputRegex =
      /(?:this\.|__publicField\(\s*this\s*,\s*['"]|\b)(\w+)['"]?\s*(?:,|=)[^;\n]*?\binput\)?(?:\.required\)?)?\s*\(([^;\n]*)/gm;
    let match: RegExpExecArray | null;
    while ((match = inputRegex.exec(src)) !== null) {
      const propName = match[1];
      const args = match[2] || '';
      const aliasMatch = /alias\s*:\s*['"]([^'"]+)['"]/.exec(args);
      if (propName && !baseMeta[propName]) {
        baseMeta[propName] = [
          new Input({
            isSignal: true,
            alias: aliasMatch?.[1],
          } as Parameters<typeof Input>[0]),
        ];
      }
    }

    // Match `prop = ...output(...)`
    const outputRegex =
      /(?:this\.|__publicField\(\s*this\s*,\s*['"]|\b)(\w+)['"]?\s*(?:,|=)[^;\n]*?\boutput\)?\s*\(([^;\n]*)/gm;
    while ((match = outputRegex.exec(src)) !== null) {
      const propName = match[1];
      const args = match[2] || '';
      const aliasMatch = /alias\s*:\s*['"]([^'"]+)['"]/.exec(args);
      if (propName && !baseMeta[propName]) {
        baseMeta[propName] = [new Output(aliasMatch?.[1])];
      }
    }

    // Match `prop = ...viewChild(...)` / `viewChild.required(...)` with string locator
    const viewChildRegex =
      /(?:this\.|__publicField\(\s*this\s*,\s*['"]|\b)(\w+)['"]?\s*(?:,|=)[^;\n]*?\bviewChild\)?(?:\.required\)?)?\s*\(\s*['"]([^'"]+)['"]/gm;
    while ((match = viewChildRegex.exec(src)) !== null) {
      const propName = match[1];
      const selector = match[2];
      if (propName && selector && !baseMeta[propName]) {
        baseMeta[propName] = [
          new ViewChild(selector, { isSignal: true } as Parameters<typeof ViewChild>[1]),
        ];
      }
    }

    const result = Object.keys(baseMeta).length > 0 ? baseMeta : undefined;
    Object.defineProperty(this, SIGNAL_PROP_CACHE, {
      value: result,
      configurable: true,
    });
    return result;
  },
});

// Angular's JIT compiler does not understand `input()` metadata, so `setInput`
// throws for signal inputs. Patch setInput to fall back to writing via the
// internal signal node when available.
interface SignalNodeLike {
  applyValueToInputSignal?: (node: SignalNodeLike, value: unknown) => void;
}

const originalSetInput = ComponentRef.prototype.setInput;
ComponentRef.prototype.setInput = function (name: string, value: unknown) {
  try {
    return originalSetInput.call(this, name, value);
  } catch (err) {
    const instance = (this as ComponentRef<unknown>).instance as
      Record<string, unknown> | undefined;
    if (instance && Object.prototype.hasOwnProperty.call(instance, name)) {
      const current = instance[name];
      if (typeof current === 'function') {
        const node = Reflect.get(current, SIGNAL) as SignalNodeLike | undefined;
        if (node) {
          if (typeof node.applyValueToInputSignal === 'function') {
            node.applyValueToInputSignal(node, value);
          } else {
            signalSetFn(node as Parameters<typeof signalSetFn>[0], value);
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

const storageMock: Storage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (idx: number) => Object.keys(store)[idx] || null,
  };
})();

if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    });
  } catch {}
}

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: storageMock,
    writable: true,
    configurable: true,
  });
} catch {}
