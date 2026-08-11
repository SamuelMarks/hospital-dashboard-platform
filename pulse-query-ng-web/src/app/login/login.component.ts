/* v8 ignore start */
/** @docs */
// pulse-query-ng-web/src/app/login/login.component.ts
import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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

/** @docs */
@Component({
  selector: 'app-login',
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
/** @docs */
export class LoginComponent implements OnInit {
  /* v8 ignore stop */
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly registrationEnabled = environment.registrationEnabled;

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hidePassword = signal(true);

  readonly formModel = signal({
    email: '',
    password: '',
  });

  readonly loginForm = form(this.formModel, (f) => {
    required(f.email, { message: 'Email is required' });
    email(f.email, { message: 'Please enter a valid email address' });

    required(f.password, { message: 'Password is required' });
    minLength(f.password, 4, { message: 'Password must be at least 4 characters' });
  });

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl('/');
    }
  }

  togglePasswordVisibility(event: Event): void {
    event.preventDefault();
    this.hidePassword.update((v) => !v);
  }

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
      error: (err) => {
        this.isLoading.set(false);
        const msg = err?.error?.detail || $localize`Invalid email or password. Please try again.`;
        this.errorMessage.set(msg);
      },
    });
  }
}
