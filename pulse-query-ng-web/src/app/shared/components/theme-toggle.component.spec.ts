/** @docs */
/**
 * @fileoverview Unit tests for ThemeToggleComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { PLATFORM_ID, signal } from '@angular/core';
import { vi } from 'vitest';
import { ThemeToggleComponent } from './theme-toggle.component';
import { ThemeService } from '../../core/theme/theme.service';

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

describe('ThemeToggleComponent', () => {
  let component: ThemeToggleComponent;
  let fixture: ComponentFixture<ThemeToggleComponent>;

  const isDarkSig = signal(false);
  const mockThemeService = {
    toggle: vi.fn(),
    isDark: isDarkSig,
    mode: signal('light' as const),
    seedColor: signal('#1565c0'),
    isTvMode: signal(false),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThemeToggleComponent, NoopAnimationsModule],
      providers: [
        { provide: ThemeService, useValue: mockThemeService },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeToggleComponent);
    component = fixture.componentInstance;
    isDarkSig.set(false);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show dark_mode icon in light mode', () => {
    isDarkSig.set(false);
    fixture.detectChanges();
    const icon = fixture.nativeElement.querySelector('mat-icon');
    expect(icon?.textContent?.trim()).toBe('dark_mode');
  });

  it('should show light_mode icon in dark mode', () => {
    isDarkSig.set(true);
    fixture.detectChanges();
    const icon = fixture.nativeElement.querySelector('mat-icon');
    expect(icon?.textContent?.trim()).toBe('light_mode');
  });

  it('should call themeService.toggle() when button is clicked', () => {
    const btn = fixture.nativeElement.querySelector('button');
    btn?.click();
    expect(mockThemeService.toggle).toHaveBeenCalledTimes(1);
  });

  it('should have aria-label="Toggle theme"', () => {
    const btn = fixture.nativeElement.querySelector('button');
    expect(btn?.getAttribute('aria-label')).toBe('Toggle theme');
  });

  it('should have data-testid="theme-toggle"', () => {
    const btn = fixture.nativeElement.querySelector('button');
    expect(btn?.getAttribute('data-testid')).toBe('theme-toggle');
  });

  it('isDark signal reflects the service value', () => {
    isDarkSig.set(true);
    expect(component.isDark()).toBe(true);
    isDarkSig.set(false);
    expect(component.isDark()).toBe(false);
  });
});
