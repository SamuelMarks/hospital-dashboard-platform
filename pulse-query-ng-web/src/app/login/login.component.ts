import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core'; 
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
      color: #1565c0; 
      text-decoration: none; 
      font-weight: 500; 
    } 
    a:hover { 
      text-decoration: underline; 
    } 
  `], 
    templateUrl: './login.component.html'
}) 
export class LoginComponent implements OnInit { 
  
    /** authService property. */
private readonly authService = inject(AuthService); 
    /** router property. */
private readonly router = inject(Router); 
  /** Activated Route to read query parameters (returnUrl). */ 
  private readonly route = inject(ActivatedRoute); 
    /** fb property. */
private readonly fb = inject(FormBuilder); 

  /** Environment Configuration: Exposed to template to toggle Registration link. */ 
  readonly registrationEnabled = environment.registrationEnabled; 

  /** Whether loading. */
  readonly isLoading = signal(false); 
  /** Error Message. */
  readonly errorMessage = signal<string | null>(null); 
  /** Hide Password. */
  readonly hidePassword = signal(true); 

  /** Login Form. */
  readonly loginForm: FormGroup = this.fb.group({ 
    email: ['', [Validators.required, Validators.email]], 
    password: ['', [Validators.required, Validators.minLength(4)]] 
  }); 

  /** Ng On Init. */
  ngOnInit(): void { 
    // Safety Net: Redirect if already logged in. 
    // This catches edge cases where Guards might have race conditions in test environments. 
    if (this.authService.isAuthenticated()) { 
       this.router.navigateByUrl('/'); 
    } 
  } 

  /** Toggles password Visibility. */
  togglePasswordVisibility(event: Event): void { 
    event.preventDefault(); 
    this.hidePassword.update(v => !v); 
  } 

  /** Handles submit. */
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
        // Determine redirect target. Default to root '/' which corresponds to Dashboard/Home. 
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/'; 
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