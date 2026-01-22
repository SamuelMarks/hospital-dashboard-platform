/** 
 * @fileoverview Test configuration setup for the Angular application. 
 * This file is the entry point for the test runner (Vitest). 
 * It initializes the Angular testing environment and sets up global browser mocks. 
 */ 

import { TestBed } from '@angular/core/testing'; 
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing'; 
import { vi } from 'vitest'; 

/** 
 * Global Mock for `window.matchMedia`. 
 * Fixes generic Material/CDK component instantiation. 
 */ 
Object.defineProperty(window, 'matchMedia', { 
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

/** 
 * Mock DOM Rect APIs for CodeMirror 6 in JSDOM. 
 */ 
Range.prototype.getClientRects = () => ({ 
  item: () => null, 
  length: 0, 
  [Symbol.iterator]: [][Symbol.iterator] 
} as unknown as DOMRectList); 

Range.prototype.getBoundingClientRect = () => ({ 
  x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, 
  toJSON: () => {} 
} as DOMRect); 

/** 
 * Mock for @material/material-color-utilities. 
 * 
 * CRITICAL FIX: 
 * We mock the entire module to prevent the test runner from attempting to resolve 
 * deep internal ESM imports (like `dynamiccolor/dynamic_color`) which fail in JSDOM/Node. 
 */ 
vi.mock('@material/material-color-utilities', () => ({ 
  // Function Stubs
  argbFromHex: (hex: string) => 0xFFFFFFFF, 
  hexFromArgb: (argb: number) => '#ffffff', 
  themeFromSourceColor: (sourceArgb: number) => ({ 
    schemes: { 
      // Return Proxies to handle any property access safely
      light: new Proxy({}, { get: () => 0xFFFFFFFF }), 
      dark: new Proxy({}, { get: () => 0xFFFFFFFF }) 
    } 
  }), 
  
  // Class Stubs
  Scheme: class {}, 
  Theme: class {}, 
  
  // ESM Compatibility
  __esModule: true
})); 

// Initialize the Angular testing environment
TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());