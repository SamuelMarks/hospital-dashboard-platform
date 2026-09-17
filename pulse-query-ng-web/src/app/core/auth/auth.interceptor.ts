/** @docs */
/**
 * @fileoverview HTTP Interceptor for Authentication Headers and 401 Handling.
 */

import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Functional HTTP Interceptor.
 *
 * Responsibilities:
 * 1. **Request**: Attaches the JWT `Authorization` header if a token exists via {@link AuthService}.
 * 2. **Response**: Monitors **401 Unauthorized** errors. If detected, attempts automatic
 *    refresh token rotation. If refresh fails or is unavailable, redirects to Login.
 *
 * @param req - Outgoing HTTP Request.
 * @param next - Next interceptor handler function.
 * @returns Observable of HTTP Event.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // 1. Attach Header
  const token = authService.getToken();
  let modifiedReq = req;

  if (token) {
    modifiedReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });
  }

  // 2. Handle Response & Expiry
  return next(modifiedReq).pipe(
    catchError((error: unknown) => {
      const isUnauthorized =
        (error instanceof HttpErrorResponse && error.status === 401) ||
        (error !== null &&
          typeof error === 'object' &&
          'status' in error &&
          (error as { status: unknown }).status === 401);

      if (isUnauthorized) {
        const isAuthRoute = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');
        if (!isAuthRoute && authService.getRefreshToken()) {
          return authService.refreshToken().pipe(
            switchMap((newToken) => {
              const retryReq = req.clone({
                headers: req.headers.set('Authorization', `Bearer ${newToken.access_token}`),
              });
              return next(retryReq);
            }),
            catchError((refreshErr) => {
              authService.logout(false);
              const returnUrl = router.routerState.snapshot.url || '/';
              router.navigate(['/login'], { queryParams: { returnUrl } });
              return throwError(() => refreshErr);
            }),
          );
        }

        if (!isAuthRoute && !router.url.includes('/login')) {
          authService.logout(false);
          const returnUrl = router.routerState.snapshot.url || '/';
          router.navigate(['/login'], { queryParams: { returnUrl } });
        }
      }

      return throwError(() => error);
    }),
  );
};
