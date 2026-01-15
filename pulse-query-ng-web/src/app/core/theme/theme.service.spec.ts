import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';
import { PLATFORM_ID } from '@angular/core';

describe('ThemeService', () => {
  let service: ThemeService;
  const STORAGE_KEY = 'pulse_theme_preference';

  const cleanup = () => {
    localStorage.clear();
    document.body.classList.remove('light-theme', 'dark-theme');
  };

  beforeEach(() => {
    cleanup();
    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    });
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    cleanup();
  });

  it('should explicitly set mode to Dark', () => {
    service.setMode('dark');
    
    expect(service.mode()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(document.body.classList.contains('dark-theme')).toBe(true);
    expect(document.body.classList.contains('light-theme')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('should toggle between modes', () => {
    service.setMode('light');
    
    service.toggle();
    expect(service.mode()).toBe('dark');
    expect(document.body.classList.contains('dark-theme')).toBe(true);

    service.toggle();
    expect(service.mode()).toBe('light');
    expect(document.body.classList.contains('light-theme')).toBe(true);
  });

  it('should detect OS preference if storage is empty', () => {
    const mockMatchMedia = vi.fn().mockReturnValue({
      matches: true
    });
    
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia
    });

    localStorage.clear();
    const newService = TestBed.runInInjectionContext(() => new ThemeService());

    expect(newService.mode()).toBe('dark');
    expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });
});