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
  fallback = 'An unexpected error occurred',
): string {
  if (err instanceof HttpErrorResponse) {
    const detail = (err.error as { detail?: unknown } | null | undefined)?.detail;
    if (detail !== undefined && detail !== null && detail !== '') {
      return typeof detail === 'string' ? detail : JSON.stringify(detail);
    }
    return err.message || fallback;
  }

  if (err instanceof Error) {
    return err.message || fallback;
  }

  if (err && typeof err === 'object') {
    const maybeDetail = (err as { error?: { detail?: unknown } }).error?.detail;
    if (maybeDetail !== undefined && maybeDetail !== null && maybeDetail !== '') {
      return typeof maybeDetail === 'string' ? maybeDetail : JSON.stringify(maybeDetail);
    }
    const maybeMsg = (err as { message?: unknown }).message;
    if (typeof maybeMsg === 'string' && maybeMsg.trim().length > 0) {
      return maybeMsg;
    }
  }

  return fallback;
}
