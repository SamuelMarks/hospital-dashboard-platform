/**
 * @fileoverview Centralized diagnostic logging service for the Angular frontend.
 *
 * Wraps browser console diagnostics behind an injectable service so components and
 * stores avoid raw `console.error` / `console.warn` calls and can be cleanly spied in tests.
 */

import { Injectable } from '@angular/core';

/**
 * Injectable logging service routing error and warning diagnostics.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  /**
   * Logs a structured error diagnostic message and optional error object.
   *
   * @param message - Contextual summary of the failure.
   * @param error - Optional underlying caught error or HTTP response.
   */
  error(message: string, error?: unknown): void {
    if (error !== undefined) {
      console.error(message, error);
    } else {
      console.error(message);
    }
  }

  /**
   * Logs a structured warning diagnostic message and optional context payload.
   *
   * @param message - Contextual summary of the warning condition.
   * @param context - Optional supplemental diagnostic payload.
   */
  warn(message: string, context?: unknown): void {
    if (context !== undefined) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }
}
