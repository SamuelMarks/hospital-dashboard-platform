/**
 * @fileoverview Shared HTTP and runtime error message formatting utilities.
 *
 * Centralizes extraction of user-facing error descriptions from Angular `HttpErrorResponse`,
 * standard `Error` objects, and structured backend `{ detail }` payloads.
 */

import { HttpErrorResponse } from '@angular/common/http';

/**
 * Extracts a concise, user-facing error message from an unknown error value.
 *
 * @param err - The caught error object (`HttpErrorResponse`, `Error`, or arbitrary value).
 * @param fallback - Default message returned when no specific message can be extracted.
 * @returns Resolved error message string.
 */
export function extractApiErrorMessage(
  err: unknown,
  fallback = $localize`An unexpected error occurred`,
): string {
  if (err instanceof HttpErrorResponse) {
    const errBody: unknown = err.error;
    const detail =
      errBody && typeof errBody === 'object' && 'detail' in errBody ? errBody.detail : undefined;
    if (detail !== undefined && detail !== null && detail !== '') {
      return typeof detail === 'string' ? detail : JSON.stringify(detail);
    }
    return err.message || fallback;
  }

  if (err instanceof Error) {
    return err.message || fallback;
  }

  if (err && typeof err === 'object') {
    const innerErr = 'error' in err ? err.error : undefined;
    const maybeDetail =
      innerErr && typeof innerErr === 'object' && 'detail' in innerErr
        ? innerErr.detail
        : undefined;
    if (maybeDetail !== undefined && maybeDetail !== null && maybeDetail !== '') {
      return typeof maybeDetail === 'string' ? maybeDetail : JSON.stringify(maybeDetail);
    }
    const maybeMsg = 'message' in err ? err.message : undefined;
    if (typeof maybeMsg === 'string' && maybeMsg.trim().length > 0) {
      return maybeMsg;
    }
  }

  return fallback;
}
