import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { 
  ReactiveFormsModule, 
  FormBuilder, 
  FormGroup, 
  Validators, 
  AbstractControl, 
  ValidationErrors, 
  ValidatorFn
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
export const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => { 
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

@Component({ 
  selector: 'app-register', 
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
  `], 
  template: `
    <mat-card>
      @if (isLoading()) { 
        <mat-progress-bar mode="indeterminate" data-testid="loading-bar"></mat-progress-bar>
      } 

      <mat-card-header>
        <mat-card-title>Create Account</mat-card-title>
        <mat-card-subtitle>Join the Hospital Analytics Platform</mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        @if (errorMessage()) { 
          <div class="error-box" role="alert" data-testid="error-alert">
            <mat-icon color="warn">error</mat-icon>
            <span>{{ errorMessage() }}</span>
          </div>
        } 

        <form [formGroup]="registerForm" (ngSubmit)="onSubmit()">
          
          <mat-form-field appearance="outline">
            <mat-label>Email address</mat-label>
            <input 
              matInput 
              formControlName="email" 
              type="email" 
              placeholder="user@example.com" 
              required
              data-testid="input-email" 
            >
            @if (registerForm.get('email')?.hasError('required')) { 
              <mat-error>Email is required</mat-error>
            } 
            @if (registerForm.get('email')?.hasError('email')) { 
              <mat-error>Please enter a valid email</mat-error>
            } 
          </mat-form-field>

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
            >
              <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (registerForm.get('password')?.hasError('required')) { 
              <mat-error>Password is required</mat-error>
            } 
            @if (registerForm.get('password')?.hasError('minlength')) { 
              <mat-error>Password must be at least 4 characters</mat-error>
            } 
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Confirm Password</mat-label>
            <input 
              matInput 
              formControlName="confirmPassword" 
              [type]="hidePassword() ? 'password' : 'text'" 
              required
              data-testid="input-confirm-password" 
            >
            @if (registerForm.get('confirmPassword')?.hasError('required')) { 
              <mat-error>Confirmation is required</mat-error>
            } 
            @if (registerForm.get('confirmPassword')?.hasError('mismatch')) { 
              <mat-error>Passwords do not match</mat-error>
            } 
          </mat-form-field>

          <button 
            mat-flat-button 
            color="primary" 
            type="submit" 
            class="full-width-btn" 
            [disabled]="registerForm.invalid || isLoading()" 
            data-testid="submit-btn" 
          >
            @if (isLoading()) { 
              Creating Account... 
            } @else { 
              Register
            } 
          </button>

        </form>

        <div class="footer-link">
          Already have an account? 
          <a routerLink="/login" data-testid="link-login">Sign in here</a>
        </div>

      </mat-card-content>
    </mat-card>
  `
}) 
export class RegisterComponent { 
  private readonly authService = inject(AuthService); 
  private readonly router = inject(Router); 
  private readonly fb = inject(FormBuilder); 

  readonly isLoading = signal(false); 
  readonly errorMessage = signal<string | null>(null); 
  readonly hidePassword = signal(true); 
  
  // Define form with validators
  readonly registerForm: FormGroup = this.fb.group({ 
    email: ['', [Validators.required, Validators.email]], 
    password: ['', [Validators.required, Validators.minLength(4)]], 
    confirmPassword: ['', [Validators.required]] 
  }, { validators: passwordMatchValidator }); 

  togglePasswordVisibility(event: Event): void { 
    event.preventDefault(); 
    this.hidePassword.update(v => !v); 
  } 

  onSubmit(): void { 
    if (this.registerForm.invalid) { 
      this.registerForm.markAllAsTouched(); 
      return; 
    } 

    this.isLoading.set(true); 
    this.errorMessage.set(null); 

    const payload: UserCreate = { 
      email: this.registerForm.get('email')?.value, 
      password: this.registerForm.get('password')?.value
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
      } 
    }); 
  } 
}