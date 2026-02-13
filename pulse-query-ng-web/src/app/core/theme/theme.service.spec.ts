/**
 * @fileoverview Unit tests for ThemeService.
 * Includes manual mocking of @material/material-color-utilities.
 * Configures DOCUMENT injection to use spies on the real JSDOM object
 * instead of a partial mock to satisfy Angular's internal SharedStylesHost requirements.
 */

import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { vi } from 'vitest';

// MOCK: @material/material-color-utilities
// Prevents module resolution errors in JSDOM environment
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

describe('ThemeService', () => {
  let service: import('./theme.service').ThemeService;
  let ThemeServiceCtor: typeof import('./theme.service').ThemeService;
  let document: Document;
  let originalMatchMedia: typeof window.matchMedia | undefined;

  const STORAGE_KEY_MODE = 'pulse_theme_mode';
  const STORAGE_KEY_SEED = 'pulse_theme_seed';

  const createMatchMedia = (matches = false, query = '(prefers-color-scheme: dark)') => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  beforeEach(async () => {
    const mod = await import('./theme.service');
    ThemeServiceCtor = mod.ThemeService;

    // Reset Storage
    localStorage.clear();
    originalMatchMedia = window.matchMedia;
    window.matchMedia = vi
      .fn()
      .mockImplementation((query: string) => createMatchMedia(false, query));

    TestBed.configureTestingModule({
      providers: [
        ThemeServiceCtor,
        { provide: PLATFORM_ID, useValue: 'browser' },
        // Note: We use the real DOCUMENT provider from JSDOM
        // to avoid crashes in SharedStylesHost which expects querySelector/etc.
      ],
    });

    service = TestBed.inject(ThemeServiceCtor);
    document = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      (window as any).matchMedia = undefined;
    }
  });

  it('should initialize with defaults (Light mode, Default Blue)', () => {
    // Spy on the real DOM elements
    const bodyAddSpy = vi.spyOn(document.body.classList, 'add');
    const rootStyleSpy = vi.spyOn(document.documentElement.style, 'setProperty');

    // Constructor triggers effect automatically in testbed
    TestBed.flushEffects();

    expect(service.mode()).toBe('light');
    expect(service.seedColor()).toBe('#1565c0');

    // Check DOM application
    expect(bodyAddSpy).toHaveBeenCalledWith('light-theme');
    // Check Variable Injection (Primary color key)
    expect(rootStyleSpy).toHaveBeenCalledWith(
      '--sys-primary',
      expect.stringMatching(/^#[0-9a-fA-F]{6}/),
    );
  });

  it('should load preferences from local storage', () => {
    localStorage.setItem(STORAGE_KEY_MODE, 'dark');
    localStorage.setItem(STORAGE_KEY_SEED, '#ff0000');

    // Spy on DOM before re-creation
    const bodyAddSpy = vi.spyOn(document.body.classList, 'add');

    // Re-instantiate to test constructor logic
    const newService = TestBed.runInInjectionContext(() => new ThemeServiceCtor());
    TestBed.flushEffects();

    expect(newService.mode()).toBe('dark');
    expect(newService.seedColor()).toBe('#ff0000');
    expect(bodyAddSpy).toHaveBeenCalledWith('dark-theme');
  });

  it('should update seed color and regenerate variables', () => {
    const rootStyleSpy = vi.spyOn(document.documentElement.style, 'setProperty');

    service.setSeedColor('#00ff00'); // set Green
    TestBed.flushEffects();

    expect(service.seedColor()).toBe('#00ff00');
    expect(localStorage.getItem(STORAGE_KEY_SEED)).toBe('#00ff00');

    // Verify CSS injection happened
    expect(rootStyleSpy).toHaveBeenCalled();
  });

  it('should toggle mode', () => {
    const bodyAddSpy = vi.spyOn(document.body.classList, 'add');

    service.setMode('light');
    TestBed.flushEffects();
    expect(service.isDark()).toBe(false);

    service.toggle();
    TestBed.flushEffects();

    expect(service.mode()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(bodyAddSpy).toHaveBeenCalledWith('dark-theme');

    service.toggle();
    TestBed.flushEffects();
    expect(service.mode()).toBe('light');
    expect(service.isDark()).toBe(false);
  });

  it('should enforce dark mode when TV mode is enabled', () => {
    const bodyAddSpy = vi.spyOn(document.body.classList, 'add');

    service.setMode('light');
    TestBed.flushEffects();

    service.setTvMode(true);
    TestBed.flushEffects();

    expect(service.isTvMode()).toBe(true);
    expect(service.mode()).toBe('dark'); // Auto-switch

    expect(bodyAddSpy).toHaveBeenCalledWith('mode-tv');
  });

  it('should remove TV mode class when disabled', () => {
    const bodyRemoveSpy = vi.spyOn(document.body.classList, 'remove');
    service.setTvMode(true);
    TestBed.flushEffects();
    service.setTvMode(false);
    TestBed.flushEffects();

    expect(bodyRemoveSpy).toHaveBeenCalledWith('mode-tv');
  });

  it('should use OS preference when saved mode is invalid', () => {
    localStorage.setItem(STORAGE_KEY_MODE, 'invalid');
    const matchSpy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query: string) => createMatchMedia(true, query));

    const newService = TestBed.runInInjectionContext(() => new ThemeServiceCtor());
    TestBed.flushEffects();

    expect(newService.mode()).toBe('dark');
    matchSpy.mockRestore();
  });

  it('should respect OS dark preference when no saved mode', () => {
    localStorage.clear();
    const matchSpy = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation((query: string) => createMatchMedia(true, query));

    const newService = TestBed.runInInjectionContext(() => new ThemeServiceCtor());
    TestBed.flushEffects();

    expect(newService.mode()).toBe('dark');
    matchSpy.mockRestore();
  });

  it('should keep dark mode when TV mode enabled and already dark', () => {
    service.setMode('dark');
    TestBed.flushEffects();

    service.setTvMode(true);
    TestBed.flushEffects();

    expect(service.mode()).toBe('dark');
  });

  it('should avoid storage writes on server platform', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ThemeServiceCtor, { provide: PLATFORM_ID, useValue: 'server' }],
    });

    const serverService = TestBed.inject(ThemeServiceCtor);
    localStorage.clear();

    serverService.setMode('dark');
    serverService.setSeedColor('#00ff00');

    expect(localStorage.getItem(STORAGE_KEY_MODE)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_SEED)).toBeNull();
  });

  it('should skip DOM updates on server platform', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        ThemeServiceCtor,
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: DOCUMENT, useValue: document },
      ],
    });
    const bodyAddSpy = vi.spyOn(document.body.classList, 'add');
    TestBed.inject(ThemeServiceCtor);
    TestBed.flushEffects();
    expect(bodyAddSpy).not.toHaveBeenCalled();
  });
});
