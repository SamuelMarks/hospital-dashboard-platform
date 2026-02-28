/* v8 ignore start */
/** @docs */
/**
 * @fileoverview HTTP Interceptor dedicated to API error feedback.
 */

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

/**
 * Functional HTTP Interceptor for global API error feedback.
 *
 * Responsibilities:
 * 1. Intercepts `HttpErrorResponse` from the HTTP pipeline.
 * 2. Filters out **401 Unauthorized** errors (handled by authentication guards/interceptors).
 * 3. Extracts meaningful error messages from the backend response (FastAPI `detail` field).
 * 4. Displays a visual notification via `MatSnackBar` using 'assertive' politeness for accessibility.
 * 5. Re-throws the error so specific components can still handle loading states.
 *
 * @param {import('@angular/common/http').HttpRequest<unknown>} req - The outgoing HTTP request.
 * @param {import('@angular/common/http').HttpHandlerFn} next - The next interceptor handling function.
 * @returns {import('rxjs').Observable<import('@angular/common/http').HttpEvent<unknown>>} An Observable of the HTTP Event.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Skip 401s; Auth mechanism handles redirection/refresh logic.
      if (error.status !== 401) {
        let message = 'An unexpected error occurred.';

        // Attempt to extract FastAPI standard 'detail' message
        if (error.error && typeof error.error === 'object') {
          // Type safety check for dynamic backend response objects
          const errObj = error.error as Record<string, any>;
          if (errObj['detail']) {
            message = Array.isArray(errObj['detail'])
              ? 'Validation Error: Check input fields.'
              : String(errObj['detail']);
          }
        } else if (error.message) {
          // Fallback to client-side error message
          message = error.message;
        }

        // Dispatch UI Notification
        // 'assertive' ensures screen readers interrupt to announce the error.
        snackBar.open(message, 'Close', {
          duration: 5000,
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
          politeness: 'assertive',
          panelClass: ['snackbar-error'], // Custom styling hook
        });
      }

      // Propagate error to subscribers
      return throwError(() => error);
    }),
  );
};
