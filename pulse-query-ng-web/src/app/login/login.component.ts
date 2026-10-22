/**
 * @fileoverview User login component providing email/password authentication via Signal Forms.
 */
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormRoot, FormField, form, required, email, minLength } from '@angular/forms/signals';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AuthService } from '../core/auth/auth.service';
import { UserCreate } from '../api-client';
import { environment } from '../../environments/environment';

/**
 * Authentication login screen component.
 */
@Component({
  selector: 'app-login',
  imports: [
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
        background-color: var(--sys-background);
        color: var(--sys-on-background);
        padding: 16px;
      }
      mat-card {
        width: 100%;
        max-width: 400px;
        background-color: var(--sys-surface);
        color: var(--sys-on-surface);
      }
      mat-card-header {
        margin-bottom: 16px;
      }
      mat-form-field {
        width: 100%;
        margin-bottom: 8px;
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
        margin-top: 8px;
      }
      .footer-link {
        margin-top: 24px;
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
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  /** Authentication service handling credential verification and token storage. */
  private readonly authService = inject(AuthService);
  /** Angular router for post-login redirects. */
  private readonly router = inject(Router);
  /** Activated route for reading `returnUrl` query parameters. */
  private readonly route = inject(ActivatedRoute);

  /** Whether self-service account registration is enabled in environment config. */
  readonly registrationEnabled = environment.registrationEnabled;

  /** Whether an authentication request is currently in progress. */
  readonly isLoading = signal(false);
  /** Error message displayed when authentication fails. */
  readonly errorMessage = signal<string | null>(null);
  /** Whether the password input characters are masked. */
  readonly hidePassword = signal(true);
  /** Localized accessible label for the password visibility toggle button. */
  readonly passwordToggleLabel = computed(() =>
    this.hidePassword() ? $localize`Show password` : $localize`Hide password`,
  );

  /** Signal model backing the login form fields. */
  readonly formModel = signal({
    email: '',
    password: '',
  });

  /** Signal form instance with email and password validation rules. */
  readonly loginForm = form(this.formModel, (f) => {
    required(f.email, { message: $localize`Email is required` });
    email(f.email, { message: $localize`Please enter a valid email address` });

    required(f.password, { message: $localize`Password is required` });
    minLength(f.password, 4, { message: $localize`Password must be at least 4 characters` });
  });

  /** Redirects already authenticated users away from the login screen. */
  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl('/');
    }
  }

  /**
   * Toggles whether the password input field is masked or visible.
   *
   * @param event - DOM click event from the visibility toggle button.
   */
  togglePasswordVisibility(event: Event): void {
    event.preventDefault();
    this.hidePassword.update((v) => !v);
  }

  /** Validates credentials and submits the login request. */
  onSubmit(): void {
    if (this.loginForm().invalid()) {
      this.loginForm().markAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const credentials: UserCreate = {
      email: this.formModel().email,
      password: this.formModel().password,
    };

    this.authService.login(credentials).subscribe({
      next: () => {
        this.isLoading.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err: { error?: { detail?: string } }) => {
        this.isLoading.set(false);
        const msg = err?.error?.detail || $localize`Invalid email or password. Please try again.`;
        this.errorMessage.set(msg);
      },
    });
  }
}
