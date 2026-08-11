/* v8 ignore start */
/** @docs */
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormRoot,
  FormField,
  form,
  required,
  email,
  minLength,
  validate,
} from '@angular/forms/signals';
import { Router, RouterModule } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AuthService } from '../core/auth/auth.service';
import { UserCreate } from '../api-client';

/** @docs */
@Component({
  selector: 'app-register',
  imports: [
    CommonModule,
    FormRoot,
    FormField,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],

  styles: [
    `
      :host {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        /* Dynamic Theming */
        background-color: var(--sys-background);
        color: var(--sys-on-background);
        padding: 16px;
      }
      mat-card {
        width: 100%;
        max-width: 450px;
        background-color: var(--sys-surface);
        color: var(--sys-on-surface);
      }
      mat-card-header {
        margin-bottom: 24px;
      }
      mat-form-field {
        width: 100%;
        margin-bottom: 4px;
      }
      .error-box {
        background-color: var(--sys-error-container);
        color: var(--sys-on-error-container);
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
        color: var(--sys-text-secondary);
      }
      a {
        color: var(--sys-primary);
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
/** @docs */
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hidePassword = signal(true);

  readonly formModel = signal({
    email: '',
    password: '',
    confirmPassword: '',
  });

  readonly registerForm = form(this.formModel, (f) => {
    required(f.email, { message: 'Email is required' });
    email(f.email, { message: 'Please enter a valid email' });

    required(f.password, { message: 'Password is required' });
    minLength(f.password, 4, { message: 'Password must be at least 4 characters' });

    required(f.confirmPassword, { message: 'Confirmation is required' });

    validate(f.confirmPassword, (ctx) => {
      if (!ctx.value() || !this.formModel().password) return null;
      if (ctx.value() !== this.formModel().password) {
        return { kind: 'mismatch', message: 'Passwords do not match' };
      }
      return null;
    });
  });

  togglePasswordVisibility(event: Event): void {
    event.preventDefault();
    this.hidePassword.update((v) => !v);
  }

  onSubmit(): void {
    if (this.registerForm().invalid()) {
      this.registerForm().markAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const payload: UserCreate = {
      email: this.formModel().email,
      password: this.formModel().password,
    };

    this.authService.register(payload).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err?.error?.detail || 'Registration failed. Please try again.';
        this.errorMessage.set(msg);
      },
    });
  }
}
