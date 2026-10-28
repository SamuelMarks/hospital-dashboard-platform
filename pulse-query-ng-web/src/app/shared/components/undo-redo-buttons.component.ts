/**
 * @fileoverview Undo/Redo Buttons Component.
 * Provides UI controls for undo and redo operations.
 */

import { Component, computed, inject } from '@angular/core';
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
@Component({
  selector: 'app-undo-redo-buttons',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],

  template: `
    <div class="undo-redo-group">
      <button
        type="button"
        mat-icon-button
        [disabled]="!undoRedoService.canUndo()"
        (click)="undo()"
        [matTooltip]="undoTooltip()"
        i18n-aria-label
        aria-label="Undo"
        data-testid="undo-button"
      >
        <mat-icon aria-hidden="true">undo</mat-icon>
      </button>

      <button
        type="button"
        mat-icon-button
        [disabled]="!undoRedoService.canRedo()"
        (click)="redo()"
        [matTooltip]="redoTooltip()"
        i18n-aria-label
        aria-label="Redo"
        data-testid="redo-button"
      >
        <mat-icon aria-hidden="true">redo</mat-icon>
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
export class UndoRedoButtonsComponent {
  /** Command history service providing undo/redo availability signals and execution methods. */
  readonly undoRedoService = inject(UndoRedoService);

  /**
   * Computed signal generating tooltip text for the undo button.
   */
  readonly undoTooltip = computed((): string => {
    const description = this.undoRedoService.nextUndoDescription();
    const base = $localize`Undo (Ctrl+Z)`;
    return description ? `${base}: ${description}` : base;
  });

  /**
   * Computed signal generating tooltip text for the redo button.
   */
  readonly redoTooltip = computed((): string => {
    const description = this.undoRedoService.nextRedoDescription();
    const base = $localize`Redo (Ctrl+Shift+Z)`;
    return description ? `${base}: ${description}` : base;
  });

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
