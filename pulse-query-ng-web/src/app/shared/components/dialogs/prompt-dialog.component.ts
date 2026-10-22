/**
 * @fileoverview Reusable single-field text input modal dialog component.
 */

import { Component, signal, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * Input configuration payload passed into `PromptDialogComponent`.
 */
export interface PromptDialogData {
  /** Dialog header title text. */
  title: string;
  /** Optional descriptive message displayed above the text field. */
  message?: string;
  /** Initial string value pre-populated in the text input field. */
  value: string;
  /** Optional form field label (defaults to `'Value'`). */
  label?: string;
}

/**
 * Modal dialog prompting the user to enter or edit a single string value.
 */
@Component({
  selector: 'app-prompt-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],

  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <p class="mb-4 text-sm text-secondary">{{ data.message }}</p>
      }
      <mat-form-field appearance="outline" class="w-full">
        <mat-label>{{ data.label || defaultLabel }}</mat-label>
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
export class PromptDialogComponent {
  /** Localized fallback label when `data.label` is omitted. */
  readonly defaultLabel = $localize`Value`;

  /**
   * Extracts the current string value from a native DOM input event.
   *
   * @param event - DOM input event dispatched by the text field.
   * @returns Current string value of the target `HTMLInputElement`.
   */
  getEventValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Injected dialog configuration data containing the title, label, and initial value. */
  readonly data = inject<PromptDialogData>(MAT_DIALOG_DATA);
  /** Reference to the active Material dialog instance used to close and return the entered value. */
  readonly dialogRef = inject<MatDialogRef<PromptDialogComponent>>(MatDialogRef);
  /** Reactive signal holding the current text input value. */
  readonly value = signal(this.data.value || '');

  /**
   * Validates that the input is non-empty and closes the dialog with the current string value.
   */
  save(): void {
    if (this.value().trim()) {
      this.dialogRef.close(this.value());
    }
  }
}
