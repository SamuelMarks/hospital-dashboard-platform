/** @docs */
/**
 * @fileoverview Keyboard Shortcuts Service.
 * Manages global keyboard shortcuts for the application.
 * Provides a centralized system for registering, handling, and displaying shortcuts.
 */

import {
  Injectable,
  inject,
  PLATFORM_ID,
  signal,
  Signal,
  Injector,
  runInInjectionContext,
  OnDestroy,
} from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { ThemeService } from '../theme/theme.service';
import { MatDialog } from '@angular/material/dialog';
import { UndoRedoService } from '../undo/undo-redo.service';

/**
 * Keyboard shortcut definition.
 */
export interface KeyboardShortcut {
  /**
   * Unique identifier for the shortcut.
   */
  id: string;

  /**
   * Human-readable description of what the shortcut does.
   */
  description: string;

  /**
   * Keyboard combination (e.g., 'ctrl+k', 'meta+shift+p').
   */
  keys: string;

  /**
   * Handler function to execute when the shortcut is triggered.
   */
  handler: () => void;

  /**
   * Category for grouping shortcuts in the help dialog.
   */
  category: 'navigation' | 'actions' | 'editing' | 'view';

  /**
   * Whether the shortcut is currently enabled.
   */
  enabled?: boolean;
}

/**
 * Keyboard Shortcuts Service.
 *
 * Provides global keyboard shortcut management with:
 * - Platform-aware key handling (Cmd on Mac, Ctrl on Windows/Linux)
 * - Shortcut registration and deregistration
 * - Help dialog with all available shortcuts
 * - Prevention of conflicts with browser shortcuts
 */
@Injectable({
  providedIn: 'root',
})
export class KeyboardShortcutsService implements OnDestroy {
  /** Injected PLATFORM_ID. */ private readonly platformId = inject(PLATFORM_ID);
  /** Injected DOCUMENT. */ private readonly document = inject(DOCUMENT);
  /** Injected Router. */ private readonly router = inject(Router);
  /** Injected ThemeService. */ private readonly themeService = inject(ThemeService);
  /** Injected MatDialog. */ private readonly dialog = inject(MatDialog);
  /** Injected Injector. */ private readonly injector = inject(Injector);
  /** Injected UndoRedoService. */ private readonly undoRedoService = inject(UndoRedoService);

  /** Map of shortcuts. */ private readonly shortcuts = new Map<string, KeyboardShortcut>();
  /** Help visibility. */ private readonly _isHelpVisible = signal(false);
  /** Bound keydown handler. */ private readonly boundKeydownHandler = (e: KeyboardEvent) =>
    this.handleKeyboardEvent(e);

  /**
   * Signal indicating whether the keyboard shortcuts help dialog is visible.
   */
  readonly isHelpVisible: Signal<boolean> = this._isHelpVisible.asReadonly();

  /** Constructor. */ constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeDefaultShortcuts();
      this.attachGlobalListener();
    }
  }

  /**
   * Registers a keyboard shortcut.
   *
   * @param shortcut - The shortcut configuration to register.
   */
  register(shortcut: KeyboardShortcut): void {
    const normalizedKeys = this.normalizeKeys(shortcut.keys);
    this.shortcuts.set(normalizedKeys, { ...shortcut, enabled: shortcut.enabled ?? true });
  }

  /**
   * Unregisters a keyboard shortcut by ID.
   *
   * @param id - The unique identifier of the shortcut to remove.
   */
  unregister(id: string): void {
    for (const [keys, shortcut] of this.shortcuts.entries()) {
      if (shortcut.id === id) {
        this.shortcuts.delete(keys);
        break;
      }
    }
  }

  /**
   * Gets all registered shortcuts grouped by category.
   *
   * @returns Map of categories to their shortcuts.
   */
  getShortcutsByCategory(): Map<string, KeyboardShortcut[]> {
    const grouped = new Map<string, KeyboardShortcut[]>();

    for (const shortcut of this.shortcuts.values()) {
      const category = shortcut.category;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(shortcut);
    }

    return grouped;
  }

  /**
   * Shows the keyboard shortcuts help dialog.
   * Opens the dialog via dynamic import to avoid circular dependency at module load time.
   */
  showHelp(): void {
    this._isHelpVisible.set(true);

    runInInjectionContext(this.injector, async () => {
      const { KeyboardShortcutsDialogComponent } =
        await import('../../shared/components/dialogs/keyboard-shortcuts-dialog.component');

      this.dialog
        .open(KeyboardShortcutsDialogComponent, {
          width: '600px',
          maxWidth: '90vw',
          autoFocus: 'first-tabbable',
        })
        .afterClosed()
        .subscribe(() => {
          this._isHelpVisible.set(false);
        });
    });
  }

  /**
   * Hides the keyboard shortcuts help dialog.
   */
  hideHelp(): void {
    this._isHelpVisible.set(false);
  }

  /**
   * Toggles the keyboard shortcuts help dialog visibility.
   */
  toggleHelp(): void {
    this._isHelpVisible.update((visible) => !visible);
  }

  /**
   * Initializes default application shortcuts.
   */
  private initializeDefaultShortcuts(): void {
    // Navigation shortcuts
    this.register({
      id: 'nav-home',
      description: 'Go to home',
      keys: 'alt+h',
      category: 'navigation',
      handler: () => this.router.navigate(['/']),
    });

    this.register({
      id: 'nav-chat',
      description: 'Open chat',
      keys: 'alt+c',
      category: 'navigation',
      handler: () => this.router.navigate(['/chat']),
    });

    this.register({
      id: 'nav-analytics',
      description: 'Go to analytics',
      keys: 'alt+a',
      category: 'navigation',
      handler: () => this.router.navigate(['/analytics']),
    });

    this.register({
      id: 'nav-simulation',
      description: 'Go to simulation',
      keys: 'alt+s',
      category: 'navigation',
      handler: () => this.router.navigate(['/simulation']),
    });

    // View shortcuts
    this.register({
      id: 'view-theme',
      description: 'Toggle dark mode',
      keys: 'alt+t',
      category: 'view',
      handler: () => this.themeService.toggle(),
    });

    // Help shortcuts
    this.register({
      id: 'help-shortcuts',
      description: 'Show keyboard shortcuts',
      keys: '?',
      category: 'actions',
      handler: () => this.showHelp(),
    });

    this.register({
      id: 'help-shortcuts-alt',
      description: 'Show keyboard shortcuts (alternative)',
      keys: 'mod+/',
      category: 'actions',
      handler: () => this.showHelp(),
    });

    // Undo/Redo shortcuts
    this.register({
      id: 'undo',
      description: 'Undo last action',
      keys: 'mod+z',
      category: 'editing',
      handler: () => {
        void this.undoRedoService.undo();
      },
    });

    this.register({
      id: 'redo',
      description: 'Redo last action',
      keys: 'mod+shift+z',
      category: 'editing',
      handler: () => {
        void this.undoRedoService.redo();
      },
    });
  }

  /**
   * Lifecycle hook: removes the global keyboard listener.
   */
  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.boundKeydownHandler);
  }

  /**
   * Attaches a global keyboard event listener to the document.
   */
  private attachGlobalListener(): void {
    this.document.addEventListener('keydown', this.boundKeydownHandler);
  }

  /**
   * Handles keyboard events and triggers matching shortcuts.
   *
   * @param event - The keyboard event to process.
   */
  private handleKeyboardEvent(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const isTyping =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (isTyping) {
      // Allow ? to open help even while typing
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        this.showHelp();
      }
      return;
    }

    const pressedKeys = this.getKeysFromEvent(event);
    const shortcut = this.shortcuts.get(pressedKeys);

    if (shortcut && shortcut.enabled !== false) {
      event.preventDefault();
      event.stopPropagation();
      shortcut.handler();
    }
  }

  /**
   * Extracts a normalized key combination string from a keyboard event.
   *
   * @param event - The keyboard event.
   * @returns Normalized key combination string.
   */
  private getKeysFromEvent(event: KeyboardEvent): string {
    const parts: string[] = [];

    if (event.ctrlKey || event.metaKey) parts.push('mod');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey && event.key !== 'Shift') parts.push('shift');

    const key = event.key.toLowerCase();
    if (key !== 'control' && key !== 'alt' && key !== 'shift' && key !== 'meta') {
      parts.push(key);
    }

    return parts.join('+');
  }

  /**
   * Normalizes a key combination string for consistent lookup.
   * Converts platform-specific modifier names to 'mod'.
   *
   * @param keys - The key combination string to normalize.
   * @returns Normalized key combination string.
   */
  private normalizeKeys(keys: string): string {
    return keys
      .toLowerCase()
      .replace(/ctrl|meta|cmd|command/g, 'mod')
      .split('+')
      .sort()
      .join('+');
  }
}
