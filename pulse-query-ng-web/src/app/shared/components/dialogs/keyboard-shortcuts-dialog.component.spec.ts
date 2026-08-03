/** @docs */
/**
 * @fileoverview Unit tests for KeyboardShortcutsDialogComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import { KeyboardShortcutsDialogComponent } from './keyboard-shortcuts-dialog.component';
import { KeyboardShortcutsService } from '../../../core/keyboard/keyboard-shortcuts.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { MatDialog } from '@angular/material/dialog';
import { signal } from '@angular/core';

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

describe('KeyboardShortcutsDialogComponent', () => {
  let component: KeyboardShortcutsDialogComponent;
  let fixture: ComponentFixture<KeyboardShortcutsDialogComponent>;

  const mockDialogRef = { close: vi.fn() };
  const mockThemeService = {
    toggle: vi.fn(),
    isDark: signal(false),
    mode: signal('light' as const),
    seedColor: signal('#1565c0'),
    isTvMode: signal(false),
  };
  const mockDialog = {
    open: vi.fn().mockReturnValue({ afterClosed: () => ({ subscribe: vi.fn() }) }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeyboardShortcutsDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: PLATFORM_ID, useValue: 'browser' },
        provideRouter([]),
        KeyboardShortcutsService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(KeyboardShortcutsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the dialog title', () => {
    const title = fixture.nativeElement.querySelector('h2');
    expect(title?.textContent).toContain('Keyboard Shortcuts');
  });

  it('should display category headings', () => {
    const headings = fixture.nativeElement.querySelectorAll('.category-title');
    expect(headings.length).toBeGreaterThan(0);
  });

  it('should display shortcut rows', () => {
    const rows = fixture.nativeElement.querySelectorAll('.shortcut-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('should display description and keys for each shortcut', () => {
    const row = fixture.nativeElement.querySelector('.shortcut-row');
    expect(row?.querySelector('.shortcut-description')).toBeTruthy();
    expect(row?.querySelector('.shortcut-keys')).toBeTruthy();
  });

  it('should have a close button with aria-label', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="close-button"]');
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute('aria-label')).toBe('Close dialog');
  });

  it('should have a "Got it" button', () => {
    const btn = fixture.nativeElement.querySelector('[data-testid="got-it-button"]');
    expect(btn).toBeTruthy();
    expect(btn?.textContent?.trim()).toBe('Got it');
  });

  it('should format mod key as ⌘ on Mac', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    expect(component.formatKeys('mod+k')).toContain('⌘');
  });

  it('should format mod key as Ctrl on non-Mac', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    expect(component.formatKeys('mod+k')).toContain('Ctrl');
  });

  it('should format alt key', () => {
    const result = component.formatKeys('alt+h');
    expect(result).toMatch(/Alt/i);
  });

  it('should format shift key', () => {
    const result = component.formatKeys('shift+z');
    expect(result).toMatch(/Shift/i);
  });

  it('should capitalise single key', () => {
    const result = component.formatKeys('?');
    expect(result).toBe('?');
  });

  it('should return categories with name, label, and shortcuts arrays', () => {
    const cats = component.categories();
    expect(cats.length).toBeGreaterThan(0);
    for (const cat of cats) {
      expect(typeof cat.name).toBe('string');
      expect(typeof cat.label).toBe('string');
      expect(Array.isArray(cat.shortcuts)).toBe(true);
    }
  });

  it('should fall back to raw category name if not mapped', () => {
    const keyboardService = TestBed.inject(KeyboardShortcutsService);
    vi.spyOn(keyboardService, 'getShortcutsByCategory').mockReturnValue(
      new Map([['custom_cat', []]]),
    );
    const newFixture = TestBed.createComponent(KeyboardShortcutsDialogComponent);
    const cats = newFixture.componentInstance.categories();
    expect(cats[0].label).toBe('custom_cat');
  });
});
