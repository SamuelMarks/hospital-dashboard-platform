/* v8 ignore start */
/** @docs */
// pulse-query-ng-web/src/app/core/auth/auth.service.ts
import { Injectable, computed, signal, inject, PLATFORM_ID, Signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { tap, catchError, Observable, throwError, switchMap } from 'rxjs';
import { AuthService as AuthApiClient, Token, UserResponse, UserCreate } from '../../api-client';

/** @docs */
@Injectable({
  providedIn: 'root',
})
/** @docs */
export class AuthService {
  private readonly TOKEN_KEY = 'pulse_auth_token';
  private readonly api = inject(AuthApiClient);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  /* v8 ignore next */
  private readonly _currentUser = signal<UserResponse | null>(null);

  readonly currentUser: Signal<UserResponse | null> = this._currentUser.asReadonly();

  /* v8 ignore next */
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
      return localStorage.getItem(this.TOKEN_KEY);
    }
    return null;
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

  logout(redirect: boolean = true): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.TOKEN_KEY);
    }
    this._currentUser.set(null);
    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  hasStoredToken(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return !!localStorage.getItem(this.TOKEN_KEY);
    }
    return false;
  }

  private handleAuthSuccess(token: Token): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.TOKEN_KEY, token.access_token);
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
