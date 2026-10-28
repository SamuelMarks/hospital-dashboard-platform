/**
 * @fileoverview Reusable single-field text input modal dialog component.
 */

import { Component, computed, signal, inject } from '@angular/core';
import { FormRoot, FormField, form, required } from '@angular/forms/signals';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

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
  imports: [
    FormRoot,
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],

  template: `
    <div class="dialog-title-row">
      <h2 mat-dialog-title>{{ data.title }}</h2>
      <button
        mat-icon-button
        type="button"
        mat-dialog-close
        i18n-aria-label
        aria-label="Close dialog"
        data-testid="close-dialog-btn"
      >
        <mat-icon aria-hidden="true">close</mat-icon>
      </button>
    </div>
    <mat-dialog-content>
      @if (data.message) {
        <p class="mb-4 text-sm text-secondary">{{ data.message }}</p>
      }
      <form [formRoot]="promptForm" (submit)="save()">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>{{ data.label || defaultLabel }}</mat-label>
          <input matInput [formField]="promptForm.value" cdkFocusInitial (keydown.enter)="save()" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button i18n type="button" mat-button mat-dialog-close>Cancel</button>
      <button
        i18n
        type="button"
        mat-flat-button
        (click)="save()"
        [disabled]="promptForm().invalid() || !value().trim()"
      >
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .dialog-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
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
  /** Reactive signal model backing the prompt Signal Form. */
  readonly formModel = signal({ value: this.data.value || '' });
  /** Signal Form instance enforcing required input value. */
  readonly promptForm = form(this.formModel, (f) => {
    required(f.value);
  });
  /** Computed convenience accessor for the current input value string. */
  readonly value = computed(() => this.formModel().value);

  /**
   * Updates the prompt text value in `formModel`.
   *
   * @param next - Updated string value.
   */
  setValue(next: string): void {
    this.formModel.set({ value: next });
  }

  /**
   * Validates that the input is non-empty and closes the dialog with the current string value.
   */
  save(): void {
    if (this.value().trim()) {
      this.dialogRef.close(this.value());
    }
  }
}
