/** @docs */
/**
 * @fileoverview Undo/Redo Buttons Component.
 * Provides UI controls for undo and redo operations.
 */

import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { UndoRedoService } from '../../core/undo/undo-redo.service';

/**
 * Undo/Redo Buttons Component.
 *
 * Displays undo and redo buttons with keyboard shortcuts and tooltips.
 * Buttons are automatically disabled when no actions are available.
 *
 * @example
 * ```html
 * <app-undo-redo-buttons />
 * ```
 */
/* v8 ignore next */
@Component({
  selector: 'app-undo-redo-buttons',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],

  template: `
    <div class="undo-redo-group">
      <button
        mat-icon-button
        [disabled]="!undoRedoService.canUndo()"
        (click)="undo()"
        [matTooltip]="undoTooltip()"
        aria-label="Undo"
        data-testid="undo-button"
      >
        <mat-icon i18n>undo</mat-icon>
      </button>

      <button
        mat-icon-button
        [disabled]="!undoRedoService.canRedo()"
        (click)="redo()"
        [matTooltip]="redoTooltip()"
        aria-label="Redo"
        data-testid="redo-button"
      >
        <mat-icon i18n>redo</mat-icon>
      </button>
    </div>
  `,
  styles: [
    `
      .undo-redo-group {
        display: flex;
        gap: 4px;
        align-items: center;
      }

      button {
        color: var(--sys-text-secondary);
      }

      button:not([disabled]) {
        color: var(--sys-primary);
      }

      button[disabled] {
        opacity: 0.4;
      }
    `,
  ],
})
/* v8 ignore next 3 */
/* v8 ignore next 5 */
export class UndoRedoButtonsComponent {
  /** Injected UndoRedoService. */
  /** Undo redo service. */ readonly undoRedoService: UndoRedoService;
  constructor() {
    this.undoRedoService = inject(UndoRedoService);
  }

  /**
   * Generates tooltip text for undo button.
   *
   * @returns Tooltip text with keyboard shortcut.
   */
  undoTooltip(): string {
    const description = this.undoRedoService.nextUndoDescription();
    const base = 'Undo (Ctrl+Z)';
    return description ? `${base}: ${description}` : base;
  }

  /**
   * Generates tooltip text for redo button.
   *
   * @returns Tooltip text with keyboard shortcut.
   */
  redoTooltip(): string {
    const description = this.undoRedoService.nextRedoDescription();
    const base = 'Redo (Ctrl+Shift+Z)';
    return description ? `${base}: ${description}` : base;
  }

  /**
   * Triggers undo operation.
   */
  async undo(): Promise<void> {
    await this.undoRedoService.undo();
  }

  /**
   * Triggers redo operation.
   */
  async redo(): Promise<void> {
    await this.undoRedoService.redo();
  }
}
