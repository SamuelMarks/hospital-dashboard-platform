/* v8 ignore start */
/** @docs */
import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/** @docs */
export interface PromptDialogData {
  title: string;
  message?: string;
  value: string;
  label?: string;
}

/** @docs */
@Component({
  selector: 'app-prompt-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],

  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <!-- v8 ignore next -->
        <p class="mb-4 text-sm text-secondary">{{ data.message }}</p>
      }
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>{{ data.label || 'Value' }}</mat-label>
        <input
          matInput
          [value]="value()"
          (input)="value.set(getEventValue($event))"
          cdkFocusInitial
          (keydown.enter)="save()"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button i18n mat-button mat-dialog-close>Cancel</button>
      <button i18n mat-flat-button color="primary" (click)="save()" [disabled]="!value().trim()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .text-secondary {
        color: var(--sys-text-secondary);
      }
      .w-full {
        width: 100%;
      }
    `,
  ],
})
/** @docs */
export class PromptDialogComponent {
  /* v8 ignore next 3 */
  /* istanbul ignore next */
  getEventValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
  readonly data = inject<PromptDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject<MatDialogRef<PromptDialogComponent>>(MatDialogRef);
  readonly value = signal(this.data.value || '');

  save() {
    if (this.value().trim()) {
      this.dialogRef.close(this.value());
    }
  }
}
