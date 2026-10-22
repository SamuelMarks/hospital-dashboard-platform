/**
 * @fileoverview Core authentication service managing JWT access/refresh tokens,
 * user session state signals, login/registration flows, and automatic session restoration.
 */

import { safeStorage } from '../storage.utils';
import { Service, computed, signal, inject, PLATFORM_ID, Signal } from '@angular/core';
import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { tap, catchError, Observable, throwError, switchMap, finalize, shareReplay } from 'rxjs';
import { AuthService as AuthApiClient, Token, UserResponse, UserCreate } from '../../api-client';

/**
 * Singleton authentication service responsible for user identity state,
 * token storage, and communicating with backend `/api/v1/auth` endpoints.
 */
@Service()
export class AuthService {
  /** LocalStorage key used to persist the JWT access token. */
  private readonly TOKEN_KEY = 'pulse_auth_token';
  /** LocalStorage key used to persist the JWT refresh token. */
  private readonly REFRESH_TOKEN_KEY = 'pulse_refresh_token';
  /** Generated OpenAPI authentication client. */
  private readonly api = inject(AuthApiClient);
  /** Angular router used for post-logout navigation. */
  private readonly router = inject(Router);
  /** Angular platform token used to guard browser storage operations during SSR. */
  private readonly platformId = inject(PLATFORM_ID);
  /** Injected DOM document reference for syncing document language attributes. */
  private readonly document = inject(DOCUMENT);

  /** Internal writable signal holding the authenticated user profile. */
  private readonly _currentUser = signal<UserResponse | null>(null);
  /** Shared in-flight observable for concurrent token refresh requests. */
  private refreshInProgress$: Observable<Token> | null = null;

  /** Read-only signal exposing the currently authenticated user profile, or `null` when logged out. */
  readonly currentUser: Signal<UserResponse | null> = this._currentUser.asReadonly();

  /** Computed signal exposing the active user's preferred language code (defaults to `'en'`). */
  readonly preferredLanguage: Signal<string> = computed(
    () => this._currentUser()?.language_preference || 'en',
  );

  /** Computed signal indicating whether the user is currently authenticated or holds a stored token. */
  readonly isAuthenticated: Signal<boolean> = computed(() => {
    return !!this._currentUser() || this.hasStoredToken();
  });

  /**
   * Initializes authentication state during application bootstrap by restoring any saved browser session.
   *
   * @returns Promise that resolves once initial session check is triggered.
   */
  initialize(): Promise<void> {
    return new Promise((resolve) => {
      if (isPlatformBrowser(this.platformId)) {
        this.tryRestoreSession();
      }
      resolve();
    });
  }

  /**
   * Retrieves the current JWT access token from browser storage.
   *
   * @returns Stored JWT access token string, or `null` if unavailable or running on the server.
   */
  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return safeStorage.getItem(this.TOKEN_KEY);
    }
    return null;
  }

  /**
   * Retrieves the current JWT refresh token from browser storage.
   *
   * @returns Stored JWT refresh token string, or `null` if unavailable or running on the server.
   */
  getRefreshToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return safeStorage.getItem(this.REFRESH_TOKEN_KEY);
    }
    return null;
  }

  /**
   * Refreshes the active authentication token using the stored refresh token.
   * Serializes concurrent calls to avoid issuing redundant rotation requests.
   *
   * @returns Observable emitting the newly rotated Token pair.
   */
  refreshToken(): Observable<Token> {
    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    const refreshTok = this.getRefreshToken();
    if (!refreshTok) {
      return throwError(() => new Error('No refresh token available'));
    }

    this.refreshInProgress$ = this.api
      .refreshAccessTokenApiV1AuthRefreshPost({ refresh_token: refreshTok })
      .pipe(
        tap((token: Token) => this.handleAuthSuccess(token)),
        catchError((err: unknown) => {
          this.logout();
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshInProgress$ = null;
        }),
        shareReplay(1),
      );

    return this.refreshInProgress$;
  }

  /**
   * Authenticates a user with email and password credentials and stores the resulting token pair.
   *
   * @param credentials - User login credentials containing email and password.
   * @returns Observable emitting the issued authentication `Token`.
   */
  login(credentials: UserCreate): Observable<Token> {
    return this.api
      .loginAccessTokenApiV1AuthLoginPost(credentials.email, credentials.password)
      .pipe(
        tap((token: Token) => this.handleAuthSuccess(token)),
        catchError((err: unknown) => throwError(() => err)),
      );
  }

  /**
   * Registers a new user account and automatically logs them in upon registration success.
   *
   * @param credentials - New user registration payload containing email and password.
   * @returns Observable emitting the authentication `Token` from the subsequent login call.
   */
  register(credentials: UserCreate): Observable<Token> {
    return this.api
      .registerUserApiV1AuthRegisterPost(credentials)
      .pipe(switchMap(() => this.login(credentials)));
  }

  /**
   * Clears stored authentication tokens, resets current user state, and optionally redirects to `/login`.
   *
   * @param redirect - Whether to navigate to the `/login` page after clearing credentials.
   */
  logout(redirect = true): void {
    if (isPlatformBrowser(this.platformId)) {
      safeStorage.removeItem(this.TOKEN_KEY);
      safeStorage.removeItem(this.REFRESH_TOKEN_KEY);
    }
    this._currentUser.set(null);
    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  /**
   * Checks whether a non-empty access token currently exists in browser storage.
   *
   * @returns True if an access token is present in storage on a browser platform.
   */
  hasStoredToken(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return !!safeStorage.getItem(this.TOKEN_KEY);
    }
    return false;
  }

  /**
   * Persists issued tokens in browser storage and triggers loading of the authenticated user profile.
   *
   * @param token - Token response payload containing `access_token` and optional `refresh_token`.
   */
  private handleAuthSuccess(token: Token): void {
    if (isPlatformBrowser(this.platformId)) {
      safeStorage.setItem(this.TOKEN_KEY, token.access_token);
      if (token.refresh_token) {
        safeStorage.setItem(this.REFRESH_TOKEN_KEY, token.refresh_token);
      }
    }
    this.fetchMe();
  }

  /**
   * Restores the user profile from the backend if a stored access token is present.
   */
  private tryRestoreSession(): void {
    if (this.hasStoredToken()) {
      this.fetchMe();
    }
  }

  /**
   * Fetches the authenticated user's profile from `/api/v1/auth/me` and logs out on failure.
   */
  private fetchMe(): void {
    this.api.readUsersMeApiV1AuthMeGet().subscribe({
      next: (user: UserResponse) => {
        this._currentUser.set(user);
        if (isPlatformBrowser(this.platformId) && this.document?.documentElement) {
          this.document.documentElement.lang = user.language_preference || 'en';
        }
      },
      error: () => {
        this.logout();
      },
    });
  }
}
