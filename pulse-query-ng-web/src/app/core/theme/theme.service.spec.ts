/** 
 * @fileoverview Unit tests for ThemeService. 
 * Includes manual mocking of @material/material-color-utilities. 
 * Configures DOCUMENT injection to use spies on the real JSDOM object 
 * instead of a partial mock to satisfy Angular's internal SharedStylesHost requirements. 
 */ 

import { TestBed } from '@angular/core/testing'; 
import { ThemeService } from './theme.service'; 
import { PLATFORM_ID } from '@angular/core'; 
import { DOCUMENT } from '@angular/common'; 
import { vi } from 'vitest';

// MOCK: @material/material-color-utilities
// Prevents module resolution errors in JSDOM environment
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xFFFFFFFF,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ 
    schemes: { 
      light: new Proxy({}, { get: () => 0xFFFFFFFF }), 
      dark: new Proxy({}, { get: () => 0xFFFFFFFF }) 
    } 
  }),
  Scheme: class {},
  Theme: class {},
  __esModule: true
}));

describe('ThemeService', () => { 
  let service: ThemeService; 
  let document: Document;

  const STORAGE_KEY_MODE = 'pulse_theme_mode'; 
  const STORAGE_KEY_SEED = 'pulse_theme_seed'; 

  beforeEach(() => { 
    // Reset Storage 
    localStorage.clear(); 

    TestBed.configureTestingModule({ 
      providers: [ 
        ThemeService, 
        { provide: PLATFORM_ID, useValue: 'browser' }
        // Note: We use the real DOCUMENT provider from JSDOM 
        // to avoid crashes in SharedStylesHost which expects querySelector/etc.
      ] 
    }); 

    service = TestBed.inject(ThemeService);
    document = TestBed.inject(DOCUMENT);
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
    expect(rootStyleSpy).toHaveBeenCalledWith('--sys-primary', expect.stringMatching(/^#[0-9a-fA-F]{6}/)); 
  }); 

  it('should load preferences from local storage', () => { 
    localStorage.setItem(STORAGE_KEY_MODE, 'dark'); 
    localStorage.setItem(STORAGE_KEY_SEED, '#ff0000'); 

    // Spy on DOM before re-creation
    const bodyAddSpy = vi.spyOn(document.body.classList, 'add');

    // Re-instantiate to test constructor logic 
    const newService = TestBed.runInInjectionContext(() => new ThemeService()); 
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
});