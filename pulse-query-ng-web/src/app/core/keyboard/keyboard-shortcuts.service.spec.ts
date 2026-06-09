/** @docs */
/**
 * @fileoverview Unit tests for KeyboardShortcutsService.
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import { KeyboardShortcutsService } from './keyboard-shortcuts.service';
import { ThemeService } from '../theme/theme.service';
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

describe('KeyboardShortcutsService', () => {
  let service: KeyboardShortcutsService;
  let mockThemeService: { toggle: ReturnType<typeof vi.fn>; isDark: ReturnType<typeof signal>; mode: ReturnType<typeof signal>; seedColor: ReturnType<typeof signal>; isTvMode: ReturnType<typeof signal> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockThemeService = {
      toggle: vi.fn(),
      isDark: signal(false),
      mode: signal('light' as const),
      seedColor: signal('#1565c0'),
      isTvMode: signal(false),
    };
    mockDialog = { open: vi.fn().mockReturnValue({ afterClosed: () => ({ subscribe: vi.fn() }) }) };

    TestBed.configureTestingModule({
      providers: [
        KeyboardShortcutsService,
        provideRouter([]),
        { provide: ThemeService, useValue: mockThemeService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(KeyboardShortcutsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with default shortcuts', () => {
    const shortcuts = service.getShortcutsByCategory();
    expect(shortcuts.size).toBeGreaterThan(0);
  });

  it('should register a new shortcut', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-shortcut',
      description: 'Test shortcut',
      keys: 'alt+q',
      category: 'actions',
      handler,
    });

    const shortcuts = service.getShortcutsByCategory();
    const actions = shortcuts.get('actions') ?? [];
    expect(actions.some((s) => s.id === 'test-shortcut')).toBe(true);
  });

  it('should unregister a shortcut by id', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-to-remove',
      description: 'Test shortcut',
      keys: 'alt+q',
      category: 'actions',
      handler,
    });

    service.unregister('test-to-remove');

    const shortcuts = service.getShortcutsByCategory();
    const actions = shortcuts.get('actions') ?? [];
    expect(actions.some((s) => s.id === 'test-to-remove')).toBe(false);
  });

  it('should group shortcuts by category', () => {
    const shortcuts = service.getShortcutsByCategory();
    expect(shortcuts.has('navigation')).toBe(true);
    expect(shortcuts.has('actions')).toBe(true);
    expect(shortcuts.has('view')).toBe(true);
  });

  it('should show help (set isHelpVisible to true)', () => {
    expect(service.isHelpVisible()).toBe(false);
    service.showHelp();
    expect(service.isHelpVisible()).toBe(true);
  });

  it('should hide help', () => {
    service.showHelp();
    service.hideHelp();
    expect(service.isHelpVisible()).toBe(false);
  });

  it('should toggle help visibility', () => {
    expect(service.isHelpVisible()).toBe(false);
    service.toggleHelp();
    expect(service.isHelpVisible()).toBe(true);
    service.toggleHelp();
    expect(service.isHelpVisible()).toBe(false);
  });

  it('should fire a registered shortcut on matching keydown event', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-fire',
      description: 'Fire test',
      keys: 'alt+y',
      category: 'actions',
      handler,
    });

    const event = new KeyboardEvent('keydown', { key: 'y', altKey: true, bubbles: true });
    document.dispatchEvent(event);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should not fire shortcut when typing in an input', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-input-block',
      description: 'Input block test',
      keys: 'alt+y',
      category: 'actions',
      handler,
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: 'y', altKey: true, bubbles: true });
    Object.defineProperty(event, 'target', { value: input, enumerable: true });
    document.dispatchEvent(event);

    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('should show help when ? pressed in an input', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true });
    Object.defineProperty(event, 'target', { value: input, enumerable: true });
    document.dispatchEvent(event);

    expect(service.isHelpVisible()).toBe(true);
    document.body.removeChild(input);
  });

  it('should not fire a disabled shortcut', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-disabled',
      description: 'Disabled shortcut',
      keys: 'alt+y',
      category: 'actions',
      handler,
      enabled: false,
    });

    const event = new KeyboardEvent('keydown', { key: 'y', altKey: true, bubbles: true });
    document.dispatchEvent(event);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should default enabled to true when not specified', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-default-enabled',
      description: 'Default enabled',
      keys: 'alt+y',
      category: 'actions',
      handler,
    });

    const shortcuts = service.getShortcutsByCategory();
    const actions = shortcuts.get('actions') ?? [];
    const found = actions.find((s) => s.id === 'test-default-enabled');
    expect(found?.enabled).toBe(true);
  });

  it('should include editing category with undo/redo shortcuts', () => {
    const shortcuts = service.getShortcutsByCategory();
    expect(shortcuts.has('editing')).toBe(true);
    const editing = shortcuts.get('editing') ?? [];
    expect(editing.some((s) => s.id === 'undo')).toBe(true);
    expect(editing.some((s) => s.id === 'redo')).toBe(true);
  });
});
