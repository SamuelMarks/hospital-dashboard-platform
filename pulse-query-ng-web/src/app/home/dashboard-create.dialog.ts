/* v8 ignore start */
/** @docs */
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormRoot, FormField, form, required, minLength } from '@angular/forms/signals';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { finalize } from 'rxjs/operators';
import { DashboardsService, DashboardCreate, DashboardResponse } from '../api-client';

/**
 * Dialog component for creating a new Dashboard.
 *
 * Manages the form state, validation, and API submission.
 * Closes and returns the new Dashboard object upon success.
 */
@Component({
  selector: 'app-dashboard-create-dialog',
  imports: [
    CommonModule,
    FormRoot,
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './dashboard-create.dialog.html',
})
/** @docs */
export class DashboardCreateDialog {
  /** API Client for Dashboard Operations. */
  private readonly dashboardsApi = inject(DashboardsService);

  /** Reference to the dialog instance to control closing. */
  private readonly dialogRef = inject(MatDialogRef<DashboardCreateDialog>);

  /** Loading state signal during API submission. */
  /* istanbul ignore next */
  readonly isSubmitting = signal(false);

  /** Error message signal for API failures. */
  /* istanbul ignore next */
  readonly error = signal<string | null>(null);

  /** Signal form model. */
  readonly formModel = signal({ name: '' });

  /** Signal Form Tree. */
  readonly form = form(this.formModel, (f) => {
    required(f.name, { message: 'Name is required' });
    minLength(f.name, 3, { message: 'Name must be at least 3 characters' });
  });

  /**
   * Handles the form submission.
   * Calls the API to create the dashboard, then closes the dialog
   * passing the new object back to the caller.
   */
  submit(): void {
    if (this.form().invalid()) return;

    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: DashboardCreate = {
      name: this.formModel().name,
    };

    this.dashboardsApi
      .createDashboardApiV1DashboardsPost(payload)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (newDash: DashboardResponse) => {
          this.dialogRef.close(newDash);
        },
        error: (err) => {
          console.error(err);
          this.error.set('Failed to create dashboard. Please try again.');
        },
      });
  }
}
