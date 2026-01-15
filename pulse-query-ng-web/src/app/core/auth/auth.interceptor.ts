/**
 * @fileoverview HTTP Interceptor for Authentication Headers and 401 Handling.
 */

import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Functional HTTP Interceptor.
 * 
 * Responsibilities:
 * 1. **Request**: Attaches the JWT `Authorization` header if a token exists via {@link AuthService}.
 * 2. **Response**: Monitors **401 Unauthorized** errors. If detected (token expired/invalid),
 *    automatically logs the user out and redirects to the Login page, preserving the
 *    current URL as a return target.
 * 
 * @param {import('@angular/common/http').HttpRequest<unknown>} req - The outgoing HTTP Request.
 * @param {import('@angular/common/http').HttpHandlerFn} next - The next interceptor handling function.
 * @returns {import('rxjs').Observable<import('@angular/common/http').HttpEvent<unknown>>} An Observable of the HTTP Event.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // 1. Attach Header
  const token = authService.getToken();
  let modifiedReq = req;

  if (token) {
    modifiedReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`)
    });
  }

  // 2. Handle Response & Expiry
  return next(modifiedReq).pipe(
    catchError((error: unknown) => {
      // Check if error is 401 Unauthorized
      if (error instanceof HttpErrorResponse && error.status === 401) {
        
        // Prevent infinite loops if /login itself returns 401
        if (!req.url.includes('/auth/login')) {
          
          // Clear client-side session state
          authService.logout(false); // false = don't double redirect, we handle specific logic here

          // Redirect to login with returnUrl
          const returnUrl = router.routerState.snapshot.url;
          router.navigate(['/login'], { queryParams: { returnUrl } });
        }
      }

      // Propagate error for other handlers (like Global Error SnackBar)
      return throwError(() => error);
    })
  );
};