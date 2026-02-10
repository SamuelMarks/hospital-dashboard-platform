/**
 * @fileoverview Core Authentication Service.
 * Manages the user session, token storage, and API communication for login/registration.
 * Uses Angular Signals for reactive state management.
 */

import { Injectable, computed, signal, inject, PLATFORM_ID, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { tap, catchError, Observable, throwError, switchMap } from 'rxjs';
import { AuthService as AuthApiClient, Token, UserResponse, UserCreate } from '../../api-client';

/**
 * Service for managing User Authentication and Session State.
 * 
 * Responsibilities:
 * - Login / Registration / Logout Logic.
 * - Token Persistence (LocalStorage).
 * - Reactive User State via Signals.
 * - Auto-login chaining after Registration.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
    /** TOKEN_KEY property. */
private readonly TOKEN_KEY = 'pulse_auth_token';
    /** api property. */
private readonly api = inject(AuthApiClient);
    /** router property. */
private readonly router = inject(Router);
    /** platformId property. */
private readonly platformId = inject(PLATFORM_ID);

  // Private mutable signal for internal state updates
    /** _currentUser property. */
private readonly _currentUser = signal<UserResponse | null>(null);
  
  /** 
  * Public read-only signal of the current user profile.
  * Subscribers can react to changes in user identity.
  */
  readonly currentUser: Signal<UserResponse | null> = this._currentUser.asReadonly();
  
  /** 
  * Computed boolean indicating if the user is effectively authenticated.
  * 
  * Logic:
  * Returns true if:
  * 1. A user profile is loaded in memory via `_currentUser`.
  * 2. OR a token exists in storage (Optimistic check for page reloads).
  * 
  * This prevents UI flickering during the async profile fetch on application bootstrap.
  */
  readonly isAuthenticated: Signal<boolean> = computed(() => {
    return !!this._currentUser() || this.hasStoredToken();
  });

  /** 
  * Initialization method called by `APP_INITIALIZER`.
  * Ensures session check runs before Router bootstraps.
  * 
  * @returns {Promise<void>} Resolves when initialization is complete.
  */
  initialize(): Promise<void> {
    return new Promise((resolve) => {
      // Storage access is only safe in browser context
      if (isPlatformBrowser(this.platformId)) {
        this.tryRestoreSession();
      }
      resolve();
    });
  }

  /** 
  * Retrieves the raw access token from storage.
  * Required by {@link authInterceptor} to attach Authorization headers.
  * 
  * @returns {string | null} The JWT string or null if not found/server-side.
  */
  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem(this.TOKEN_KEY);
    }
    return null;
  }

  /** 
  * Authenticates the user and initiates a session.
  * 
  * @param {UserCreate} credentials - The login credentials (email/password).
  * @returns {Observable<Token>} Observable emitting the Access Token.
  */
  login(credentials: UserCreate): Observable<Token> {
    return this.api.loginAccessTokenApiV1AuthLoginPost(credentials.email, credentials.password)
      .pipe(
        tap((token: Token) => this.handleAuthSuccess(token)),
        catchError((err: unknown) => throwError(() => err))
      );
  }

  /** 
  * Registers a new user and automatically logs them in.
  * 
  * Backend Note: The 'register' endpoint provisions a default dashboard.
  * Automated login ensures the user lands immediately in their new workspace.
  * 
  * @param {UserCreate} credentials - The registration details.
  * @returns {Observable<Token>} Observable of the Token (result of the chained login).
  */
  register(credentials: UserCreate): Observable<Token> {
    return this.api.registerUserApiV1AuthRegisterPost(credentials).pipe(
      // Seamlessly transition to login flow
      switchMap(() => this.login(credentials))
    );
  }

  /** 
  * Terminates the session.
  * 
  * @param {boolean} [redirect=true] - Whether to navigate to the Login page after clearing state.
  */
  logout(redirect: boolean = true): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.TOKEN_KEY);
    }
    this._currentUser.set(null);
    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  /** 
  * Checks for token existence in persistence layer.
  * Useful for guards to allow navigation while the user profile loads asynchronously.
  * 
  * @returns {boolean} True if a token string exists.
  */
  hasStoredToken(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return !!localStorage.getItem(this.TOKEN_KEY);
    }
    return false;
  }

  /** 
  * Internal handler for successful authentication.
  * Persists token and triggers user profile fetch.
  * 
  * @param {Token} token - The received JWT object.
  */
  private handleAuthSuccess(token: Token): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.TOKEN_KEY, token.access_token);
    }
    // Fetch detailed profile immediately
    this.fetchMe();
  }

  /** 
  * Attempts to restore the session on app startup.
  */
  private tryRestoreSession(): void {
    if (this.hasStoredToken()) {
      this.fetchMe();
    }
  }

  /** 
  * Fetches the current user profile from the API.
  * Handles invalid/expired tokens by forcing logout.
  */
  private fetchMe(): void {
    this.api.readUsersMeApiV1AuthMeGet().subscribe({
      next: (user: UserResponse) => this._currentUser.set(user),
      error: () => {
        // Token invalid or expired -> Force logout to clear stale state
        this.logout();
      }
    });
  }
}