/**
 * @fileoverview Reusable confirmation modal dialog component for destructive and standard user actions.
 */

import { Component, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

/**
 * Input configuration payload passed into `ConfirmDialogComponent`.
 */
export interface ConfirmDialogData {
  /** Dialog header title text. */
  title: string;
  /** Descriptive body text explaining the action to confirm. */
  message: string;
  /** Optional custom label for the confirmation button (defaults to `'Confirm'`). */
  confirmJson?: string;
  /** Whether the action is destructive and should style the confirm button with warn color. */
  isDestructive?: boolean;
}

/**
 * Modal dialog presenting a confirmation prompt with Cancel and Confirm buttons.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],

  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p class="mat-body-1 text-secondary">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button i18n mat-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        [color]="data.isDestructive ? 'warn' : 'primary'"
        [mat-dialog-close]="true"
        cdkFocusInitial
      >
        {{ data.confirmJson || 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .text-secondary {
        color: var(--sys-text-secondary);
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  /** Injected dialog configuration data specifying the title, message, and button styling. */
  public data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  /** Reference to the active Material dialog instance. */
  public dialogRef = inject<MatDialogRef<ConfirmDialogComponent>>(MatDialogRef);
}
