import { safeStorage } from '../storage.utils';

/** @docs */
// pulse-query-ng-web/src/app/core/auth/auth.service.ts
import { Injectable, computed, signal, inject, PLATFORM_ID, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { tap, catchError, Observable, throwError, switchMap, finalize, shareReplay } from 'rxjs';
import { AuthService as AuthApiClient, Token, UserResponse, UserCreate } from '../../api-client';

/** @docs */
@Injectable({
  providedIn: 'root',
})
/** @docs */
export class AuthService {
  private readonly TOKEN_KEY = 'pulse_auth_token';
  private readonly REFRESH_TOKEN_KEY = 'pulse_refresh_token';
  private readonly api = inject(AuthApiClient);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _currentUser = signal<UserResponse | null>(null);
  private refreshInProgress$: Observable<Token> | null = null;

  readonly currentUser: Signal<UserResponse | null> = this._currentUser.asReadonly();

  readonly isAuthenticated: Signal<boolean> = computed(() => {
    return !!this._currentUser() || this.hasStoredToken();
  });

  initialize(): Promise<void> {
    return new Promise((resolve) => {
      if (isPlatformBrowser(this.platformId)) {
        this.tryRestoreSession();
      }
      resolve();
    });
  }

  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return safeStorage.getItem(this.TOKEN_KEY);
    }
    return null;
  }

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

  login(credentials: UserCreate): Observable<Token> {
    return this.api
      .loginAccessTokenApiV1AuthLoginPost(credentials.email, credentials.password)
      .pipe(
        tap((token: Token) => this.handleAuthSuccess(token)),
        catchError((err: unknown) => throwError(() => err)),
      );
  }

  register(credentials: UserCreate): Observable<Token> {
    return this.api
      .registerUserApiV1AuthRegisterPost(credentials)
      .pipe(switchMap(() => this.login(credentials)));
  }

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

  hasStoredToken(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return !!safeStorage.getItem(this.TOKEN_KEY);
    }
    return false;
  }

  private handleAuthSuccess(token: Token): void {
    if (isPlatformBrowser(this.platformId)) {
      safeStorage.setItem(this.TOKEN_KEY, token.access_token);
      if (token.refresh_token) {
        safeStorage.setItem(this.REFRESH_TOKEN_KEY, token.refresh_token);
      }
    }
    this.fetchMe();
  }

  private tryRestoreSession(): void {
    if (this.hasStoredToken()) {
      this.fetchMe();
    }
  }

  private fetchMe(): void {
    this.api.readUsersMeApiV1AuthMeGet().subscribe({
      next: (user: UserResponse) => this._currentUser.set(user),
      error: () => {
        this.logout();
      },
    });
  }
}
