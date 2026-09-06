/** @docs */
/**
 * @fileoverview Keyboard Shortcuts Help Dialog Component.
 * Displays all available keyboard shortcuts grouped by category.
 */

import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import {
  KeyboardShortcutsService,
  KeyboardShortcut,
} from '../../../core/keyboard/keyboard-shortcuts.service';

/**
 * Keyboard Shortcuts Help Dialog Component.
 *
 * Displays a modal dialog with all registered keyboard shortcuts,
 * organized by category for easy reference.
 *
 * @example
 * ```typescript
 * this.dialog.open(KeyboardShortcutsDialogComponent);
 * ```
 */
@Component({
  selector: 'app-keyboard-shortcuts-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule],

  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <h2 i18n mat-dialog-title>Keyboard Shortcuts</h2>
        <button
          mat-icon-button
          mat-dialog-close
          aria-label="Close dialog"
          data-testid="close-button"
        >
          <mat-icon i18n>close</mat-icon>
        </button>
      </div>

      <mat-dialog-content>
        @for (category of categories(); track category.name) {
          <div class="category-section">
            <h3 class="category-title">{{ category.label }}</h3>
            <div class="shortcuts-list">
              @for (shortcut of category.shortcuts; track shortcut.id) {
                <div class="shortcut-row">
                  <span class="shortcut-description">{{ shortcut.description }}</span>
                  <kbd class="shortcut-keys">{{ formatKeys(shortcut.keys) }}</kbd>
                </div>
              }
            </div>
          </div>
          @if (!$last) {
            <mat-divider />
          }
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button i18n mat-button mat-dialog-close data-testid="got-it-button">Got it</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [
    `
      .dialog-container {
        min-width: 500px;
        max-width: 600px;
      }

      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px 0;
      }

      h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 500;
        color: var(--sys-text-primary);
      }

      mat-dialog-content {
        padding: 24px;
        max-height: 60vh;
        overflow-y: auto;
      }

      .category-section {
        margin-bottom: 24px;
      }

      .category-section:last-child {
        margin-bottom: 0;
      }

      .category-title {
        font-size: 14px;
        font-weight: 500;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
        margin: 0 0 12px 0;
        letter-spacing: 0.5px;
      }

      .shortcuts-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .shortcut-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-radius: 4px;
        background-color: var(--sys-surface-variant);
        transition: background-color 0.2s;
      }

      .shortcut-row:hover {
        background-color: var(--sys-hover);
      }

      .shortcut-description {
        font-size: 14px;
        color: var(--sys-text-primary);
      }

      .shortcut-keys {
        font-family: 'Roboto Mono', monospace;
        font-size: 12px;
        padding: 4px 8px;
        background-color: var(--sys-surface);
        border: 1px solid var(--sys-outline-variant);
        border-radius: 4px;
        color: var(--sys-text-primary);
        white-space: nowrap;
      }

      mat-divider {
        margin: 16px 0;
      }

      mat-dialog-actions {
        padding: 16px 24px;
      }

      @media (max-width: 600px) {
        .dialog-container {
          min-width: unset;
          width: 100%;
        }
      }
    `,
  ],
})
/* v8 ignore start */
export class KeyboardShortcutsDialogComponent {
  /** Injected MatDialogRef. */ private readonly dialogRef = inject(
    MatDialogRef<KeyboardShortcutsDialogComponent>,
  );
  /** Injected KeyboardService. */ private readonly keyboardService =
    inject(KeyboardShortcutsService);
  /* v8 ignore stop */

  /**
   * Computed signal containing shortcuts grouped by category.
   */
  /* v8 ignore start */
  readonly categories = computed(() => {
    const shortcutsByCategory = this.keyboardService.getShortcutsByCategory();
    const categoryLabels: Record<string, string> = {
      navigation: 'Navigation',
      actions: 'Global Actions',
      editing: 'Editor',
      view: 'View',
    };

    return Array.from(shortcutsByCategory.entries()).map(([name, shortcuts]) => ({
      name,
      label: categoryLabels[name] || name,
      shortcuts,
    }));
  });
  /* v8 ignore stop */

  /**
   * Formats key combination for display.
   * Converts 'mod' to platform-specific modifier key.
   *
   * @param keys - The key combination string.
   * @returns Formatted key combination for display.
   */
  formatKeys(keys: string): string {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return keys
      .replace(/mod/gi, isMac ? '⌘' : 'Ctrl')
      .replace(/alt/gi, isMac ? '⌥' : 'Alt')
      .replace(/shift/gi, isMac ? '⇧' : 'Shift')
      .split('+')
      .map((key) => key.charAt(0).toUpperCase() + key.slice(1))
      .join(' + ');
  }
}
