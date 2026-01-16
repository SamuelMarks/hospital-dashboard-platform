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
 * 
 * Required by Angular Material components (e.g., MatTooltip, MatSidenav) that rely on 
 * `@angular/cdk/layout` BreakpointObserver. JSDOM does not implement this API by default. 
 * 
 * We patch `addListener` and `removeListener` as CDK still supports these deprecated methods 
 * for broader browser compatibility. 
 */ 
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated but required by CDK
    removeListener: vi.fn(), // Deprecated but required by CDK
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Initialize the Angular testing environment
TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());