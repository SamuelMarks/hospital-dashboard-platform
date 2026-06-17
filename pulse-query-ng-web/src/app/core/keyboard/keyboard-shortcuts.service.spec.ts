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

import { Subject } from 'rxjs';

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
  let mockThemeService: {
    toggle: ReturnType<typeof vi.fn>;
    isDark: ReturnType<typeof signal>;
    mode: ReturnType<typeof signal>;
    seedColor: ReturnType<typeof signal>;
    isTvMode: ReturnType<typeof signal>;
  };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockThemeService = {
      toggle: vi.fn(),
      isDark: signal(false),
      mode: signal('light' as const),
      seedColor: signal('#1565c0'),
      isTvMode: signal(false),
    };
    mockDialog = { open: vi.fn().mockReturnValue({ afterClosed: () => ({ subscribe: (cb: () => void) => cb() }) }) };

    TestBed.configureTestingModule({
      providers: [
        KeyboardShortcutsService,
        { provide: Router, useValue: { navigate: vi.fn() } },
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

  it('should show help when ? pressed in an input without modifiers', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: '?', bubbles: true });
    Object.defineProperty(event, 'target', { value: input, enumerable: true });
    document.dispatchEvent(event);

    expect(service.isHelpVisible()).toBe(true);
    document.body.removeChild(input);
  });

  it('should NOT show help when ? pressed in an input with modifiers', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', { key: '?', ctrlKey: true, bubbles: true });
    Object.defineProperty(event, 'target', { value: input, enumerable: true });
    document.dispatchEvent(event);

    expect(service.isHelpVisible()).toBe(false);
    document.body.removeChild(input);
  });

  it('should ignore unmapped key combinations', () => {
    const event = new KeyboardEvent('keydown', { key: 'UnmappedKey', bubbles: true });
    expect(() => document.dispatchEvent(event)).not.toThrow();
  });

  it('should handle metaKey and ctrlKey as mod', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-mod',
      description: 'Mod test',
      keys: 'mod+m',
      category: 'actions',
      handler,
    });

    // Test metaKey
    const metaEvent = new KeyboardEvent('keydown', { key: 'm', metaKey: true, bubbles: true });
    document.dispatchEvent(metaEvent);
    expect(handler).toHaveBeenCalledTimes(1);

    // Test ctrlKey
    const ctrlEvent = new KeyboardEvent('keydown', { key: 'm', ctrlKey: true, bubbles: true });
    document.dispatchEvent(ctrlEvent);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should handle shift modifier properly', () => {
    const handler = vi.fn();
    service.register({
      id: 'test-shift',
      description: 'Shift test',
      keys: 'shift+s',
      category: 'actions',
      handler,
    });

    const shiftEvent = new KeyboardEvent('keydown', { key: 's', shiftKey: true, bubbles: true });
    document.dispatchEvent(shiftEvent);
    expect(handler).toHaveBeenCalledTimes(1);
    
    // Pressing 'Shift' key alone should not trigger it
    const shiftOnlyEvent = new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, bubbles: true });
    document.dispatchEvent(shiftOnlyEvent);
    expect(handler).toHaveBeenCalledTimes(1); // Still 1
  });

  it('should normalize ctrl, meta, cmd, command in shortcut definition', () => {
    const handler1 = vi.fn();
    service.register({ id: 'test-ctrl', description: 'desc', keys: 'ctrl+a', category: 'actions', handler: handler1 });
    
    const handler2 = vi.fn();
    service.register({ id: 'test-cmd', description: 'desc', keys: 'cmd+b', category: 'actions', handler: handler2 });

    const handler3 = vi.fn();
    service.register({ id: 'test-command', description: 'desc', keys: 'command+c', category: 'actions', handler: handler3 });

    // Ensure they were all registered with normalized key 'mod'
    const event1 = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true });
    document.dispatchEvent(event1);
    expect(handler1).toHaveBeenCalledTimes(1);

    const event2 = new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true });
    document.dispatchEvent(event2);
    expect(handler2).toHaveBeenCalledTimes(1);

    const event3 = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true });
    document.dispatchEvent(event3);
    expect(handler3).toHaveBeenCalledTimes(1);
  });

  it('should not throw a disabled shortcut', () => {
  const handler = vi.fn();
  service.register({
    id: 'test-disabled',
    description: 'Disabled shortcut',
    keys: 'd',
    category: 'actions',
    handler,
    enabled: false,
  });

  const event = new KeyboardEvent('keydown', { key: 'd', bubbles: true });
  document.dispatchEvent(event);

  expect(handler).not.toHaveBeenCalled();
});

it('should skip initialization on server platform', () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      KeyboardShortcutsService,
      { provide: PLATFORM_ID, useValue: 'server' },
      provideRouter([]),
      { provide: ThemeService, useValue: mockThemeService },
      { provide: MatDialog, useValue: mockDialog },
    ],
  });
  const serverService = TestBed.inject(KeyboardShortcutsService);
  expect(serverService).toBeTruthy();
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

  it('should call all default shortcut handlers', () => {
    const shortcuts = service.getShortcutsByCategory();
    const actions = shortcuts.get('actions') ?? [];
    const editing = shortcuts.get('editing') ?? [];
    const nav = shortcuts.get('navigation') ?? [];
    const view = shortcuts.get('view') ?? [];

    const helpShortcut = actions.find((s) => s.id === 'help-shortcuts');
    helpShortcut?.handler();
    expect(service.isHelpVisible()).toBe(true);

    const helpAltShortcut = actions.find((s) => s.id === 'help-shortcuts-alt');
    helpAltShortcut?.handler();

    const undoShortcut = editing.find((s) => s.id === 'undo');
    const redoShortcut = editing.find((s) => s.id === 'redo');
    expect(() => undoShortcut?.handler()).not.toThrow();
    expect(() => redoShortcut?.handler()).not.toThrow();

    const navHome = nav.find((s) => s.id === 'nav-home');
    const navChat = nav.find((s) => s.id === 'nav-chat');
    const navAnalytics = nav.find((s) => s.id === 'nav-analytics');
    const navSim = nav.find((s) => s.id === 'nav-simulation');
    
    expect(() => navHome?.handler()).not.toThrow();
    expect(() => navChat?.handler()).not.toThrow();
    expect(() => navAnalytics?.handler()).not.toThrow();
    expect(() => navSim?.handler()).not.toThrow();

    const viewTheme = view.find((s) => s.id === 'view-theme');
    expect(() => viewTheme?.handler()).not.toThrow();
  });
});
