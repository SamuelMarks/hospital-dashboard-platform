import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  ReactiveFormsModule, 
  FormBuilder, 
  FormGroup, 
  Validators
} from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';

// Material Imports
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
 * Login Component.
 * 
 * Provides the user interface for authentication.
 * Handles redirection back to the requested page (Return URL) after successful login.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
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
      max-width: 400px; 
    }
    mat-card-header { 
      margin-bottom: 16px; 
    }
    mat-form-field { 
      width: 100%; 
      margin-bottom: 8px; 
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
      margin-top: 8px; 
    }
    .footer-link { 
      margin-top: 24px; 
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
  `],
  template: `
    <mat-card>
      <!-- Indeterminate loader at the top of the card -->
      @if (isLoading()) {
        <mat-progress-bar mode="indeterminate" data-testid="loading-bar"></mat-progress-bar>
      }

      <mat-card-header>
        <mat-card-title>Sign in</mat-card-title>
        <mat-card-subtitle>Hospital Analytics Platform</mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <!-- Error Alert -->
        @if (errorMessage()) {
          <div class="error-box" role="alert" data-testid="error-alert">
            <mat-icon color="warn">error</mat-icon>
            <span>{{ errorMessage() }}</span>
          </div>
        }

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          
          <!-- Email Field -->
          <mat-form-field appearance="outline">
            <mat-label>Email address</mat-label>
            <input 
              matInput 
              formControlName="email" 
              type="email" 
              placeholder="doctor@hospital.com" 
              required
              data-testid="input-email"
            >
            @if (loginForm.get('email')?.hasError('required')) {
              <mat-error>Email is required</mat-error>
            }
            @if (loginForm.get('email')?.hasError('email')) {
              <mat-error>Please enter a valid email address</mat-error>
            }
          </mat-form-field>

          <!-- Password Field -->
          <mat-form-field appearance="outline">
            <mat-label>Password</mat-label>
            <input 
              matInput 
              formControlName="password" 
              [type]="hidePassword() ? 'password' : 'text'" 
              required
              data-testid="input-password"
            >
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="togglePasswordVisibility($event)"
              [attr.aria-label]="'Hide password'"
              [attr.aria-pressed]="hidePassword()"
            >
              <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (loginForm.get('password')?.hasError('required')) {
              <mat-error>Password is required</mat-error>
            }
            @if (loginForm.get('password')?.hasError('minlength')) {
              <mat-error>Password must be at least 4 characters</mat-error>
            }
          </mat-form-field>

          <!-- Submit Action -->
           <button 
            mat-flat-button 
            color="primary" 
            type="submit" 
            class="full-width-btn" 
            [disabled]="loginForm.invalid || isLoading()"
            data-testid="submit-btn"
          >
            @if (isLoading()) {
              Signing in...
            } @else {
              Sign in
            }
          </button>

        </form>

        <!-- Dynamic Registration Link -->
        @if (registrationEnabled) {
          <div class="footer-link">
            Don't have an account? 
            <a routerLink="/register" data-testid="link-register">Create one</a>
          </div>
        }

      </mat-card-content>
    </mat-card>
  `
})
export class LoginComponent {
  
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  /** Activated Route to read query parameters (returnUrl). */
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  /** Environment Configuration: Exposed to template to toggle Registration link. */
  readonly registrationEnabled = environment.registrationEnabled;

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly hidePassword = signal(true);

  readonly loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]]
  });

  togglePasswordVisibility(event: Event): void {
    event.preventDefault();
    this.hidePassword.update(v => !v);
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const credentials: UserCreate = {
      email: this.loginForm.get('email')?.value,
      password: this.loginForm.get('password')?.value
    };

    this.authService.login(credentials).subscribe({
      next: () => {
        this.isLoading.set(false);
        // Determine redirect target
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.isLoading.set(false);
        const msg = err?.error?.detail || 'Invalid email or password. Please try again.';
        this.errorMessage.set(msg);
      }
    });
  }
}