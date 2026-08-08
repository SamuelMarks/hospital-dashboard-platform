/* v8 ignore start */
/** @docs */
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

/** @docs */
export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmJson?: string;
  isDestructive?: boolean;
}

/** @docs */
@Component({
  selector: 'app-confirm-dialog',
  imports: [CommonModule, MatDialogModule, MatButtonModule],

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
/** @docs */
export class ConfirmDialogComponent {
  public data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  public dialogRef = inject<MatDialogRef<ConfirmDialogComponent>>(MatDialogRef);
}
