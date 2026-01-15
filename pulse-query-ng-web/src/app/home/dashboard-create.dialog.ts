import { Component, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Create New Dashboard</h2>
    
    <mat-dialog-content>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <p class="text-sm text-gray-500 mb-4">Enter a name for your new analytics workspace.</p>
        
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Dashboard Name</mat-label>
          <input matInput formControlName="name" placeholder="e.g. Q3 Overview" data-testid="input-name">
          @if (form.get('name')?.hasError('required')) {
            <mat-error>Name is required</mat-error>
          }
          @if (form.get('name')?.hasError('minlength')) {
            <mat-error>Name must be at least 3 characters</mat-error>
          }
        </mat-form-field>

        @if (error()) {
          <div class="text-red-600 text-sm mb-2" data-testid="error-msg">
            {{ error() }}
          </div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button 
        mat-flat-button 
        color="primary" 
        (click)="submit()" 
        [disabled]="form.invalid || isSubmitting()"
        data-testid="btn-submit"
      >
        @if (isSubmitting()) {
          Creating...
        } @else {
          Create
        }
      </button>
    </mat-dialog-actions>
  `
})
export class DashboardCreateDialog {
  /** API Client for Dashboard Operations. */
  private readonly dashboardsApi = inject(DashboardsService);
  
  /** Reference to the dialog instance to control closing. */
  private readonly dialogRef = inject(MatDialogRef<DashboardCreateDialog>);
  
  /** FormBuilder for the input form. */
  private readonly fb = inject(FormBuilder);

  /** Loading state signal during API submission. */
  readonly isSubmitting = signal(false);
  
  /** Error message signal for API failures. */
  readonly error = signal<string | null>(null);

  /** Reactive Form Group. */
  readonly form: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]]
  });

  /**
   * Handles the form submission.
   * Calls the API to create the dashboard, then closes the dialog 
   * passing the new object back to the caller.
   */
  submit(): void {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    this.error.set(null);

    const payload: DashboardCreate = {
      name: this.form.value.name
    };

    this.dashboardsApi.createDashboardApiV1DashboardsPost(payload)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (newDash: DashboardResponse) => {
          this.dialogRef.close(newDash);
        },
        error: (err) => {
          console.error(err);
          this.error.set('Failed to create dashboard. Please try again.');
        }
      });
  }
}