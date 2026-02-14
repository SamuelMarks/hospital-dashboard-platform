import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

// Material Imports
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AuthService } from '../core/auth/auth.service';
import { UserCreate } from '../api-client';

/**
 * Validator to check if 'password' and 'confirmPassword' fields match.
 */
export const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  // Only validate if both controls exist and have values
  if (password && confirmPassword && password.value !== confirmPassword.value) {
    confirmPassword.setErrors({ mismatch: true });
    return { mismatch: true };
  } else {
    // Only clear error if the source of error is mismatch
    if (confirmPassword?.hasError('mismatch')) {
      confirmPassword.setErrors(null);
    }
    return null;
  }
};

/** Register component. */
@Component({
  selector: 'app-register',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background-color: #f5f5f5;
        padding: 16px;
      }
      mat-card {
        width: 100%;
        max-width: 450px;
      }
      mat-card-header {
        margin-bottom: 24px;
      }
      mat-form-field {
        width: 100%;
        margin-bottom: 4px;
      }
      .error-box {
        background-color: #ffebee;
        color: #c62828;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }
      .full-width-btn {
        width: 100%;
        margin-top: 12px;
      }
      .footer-link {
        margin-top: 16px;
        text-align: center;
        font-size: 14px;
      }
      a {
        color: #1976d2;
        text-decoration: none;
        font-weight: 500;
      }
      a:hover {
        text-decoration: underline;
      }
    `,
  ],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  /** authService property. */
  private readonly authService = inject(AuthService);
  /** router property. */
  private readonly router = inject(Router);
  /** fb property. */
  private readonly fb = inject(FormBuilder);

  /** Whether loading. */
  /* istanbul ignore next */
  readonly isLoading = signal(false);
  /** Error Message. */
  /* istanbul ignore next */
  readonly errorMessage = signal<string | null>(null);
  /** Hide Password. */
  /* istanbul ignore next */
  readonly hidePassword = signal(true);

  // Define form with validators
  /** Register Form. */
  readonly registerForm: FormGroup = this.fb.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator },
  );

  /** Toggles password Visibility. */
  togglePasswordVisibility(event: Event): void {
    event.preventDefault();
    this.hidePassword.update((v) => !v);
  }

  /** Handles submit. */
  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const payload: UserCreate = {
      email: this.registerForm.get('email')?.value,
      password: this.registerForm.get('password')?.value,
    };

    this.authService.register(payload).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading.set(false);
        // Handle detail extracted from backend HTTPException
        const msg = err?.error?.detail || 'Registration failed. Please try again.';
        this.errorMessage.set(msg);
      },
    });
  }
}
