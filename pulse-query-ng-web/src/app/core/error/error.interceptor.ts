/* v8 ignore start */
/** @docs */
/**
 * @fileoverview HTTP Interceptor dedicated to API error feedback.
 */

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { ConnectionStatusService } from '../health/connection-status.service';

/** Timestamp of the last network unreachable toast to prevent spamming. */
let lastNetworkToastTime = 0;

/**
 * Functional HTTP Interceptor for global API error feedback.
 *
 * Responsibilities:
 * 1. Intercepts `HttpErrorResponse` from the HTTP pipeline.
 * 2. Filters out **401 Unauthorized** errors (handled by authentication guards/interceptors).
 * 3. Handles status 0 network errors and notifies ConnectionStatusService.
 * 4. Extracts meaningful error messages from the backend response (FastAPI `detail` or structured database errors).
 * 5. Displays a visual notification via `MatSnackBar` with optional "Troubleshoot" action.
 * 6. Re-throws the error so specific components can still handle loading states.
 *
 * @param {import('@angular/common/http').HttpRequest<unknown>} req - The outgoing HTTP request.
 * @param {import('@angular/common/http').HttpHandlerFn} next - The next interceptor handling function.
 * @returns {import('rxjs').Observable<import('@angular/common/http').HttpEvent<unknown>>} An Observable of the HTTP Event.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const snackBar = inject(MatSnackBar);
  const connectionService = inject(ConnectionStatusService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // Skip 401s; Auth mechanism handles redirection/refresh logic.
      if (error.status !== 401) {
        let message = 'An unexpected error occurred.';
        let action = 'Close';

        if (error.status === 0) {
          connectionService.markBackendUnreachable();
          message = 'Cannot reach Pulse Query Backend server. Please verify the API is running.';
          action = 'Troubleshoot';

          const now = Date.now();
          if (now - lastNetworkToastTime < 3000) {
            return throwError(() => error);
          }
          lastNetworkToastTime = now;
        } else if (error.status === 503) {
          message = 'Database service unavailable. Backend database may be misconfigured.';
          action = 'Troubleshoot';
        } else if (error.error && typeof error.error === 'object') {
          // Type safety check for dynamic backend response objects
          const errObj = error.error as Record<string, unknown>;
          if (errObj['code'] && errObj['message']) {
            message = String(errObj['message']);
            if (errObj['remediation_hint']) {
              message += ` (${String(errObj['remediation_hint'])})`;
            }
          } else if (errObj['detail']) {
            message = Array.isArray(errObj['detail'])
              ? 'Validation Error: Check input fields.'
              : String(errObj['detail']);
          }
        } else if (error.message) {
          // Fallback to client-side error message
          message = error.message;
        }

        // Dispatch UI Notification
        const ref = snackBar.open(message, action, {
          duration: action === 'Troubleshoot' ? 7000 : 5000,
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
          politeness: 'assertive',
          panelClass: ['snackbar-error'],
        });

        if (action === 'Troubleshoot') {
          ref.onAction().subscribe(() => {
            connectionService.openDiagnosticsDialog();
          });
        }
      }

      // Propagate error to subscribers
      return throwError(() => error);
    }),
  );
};
