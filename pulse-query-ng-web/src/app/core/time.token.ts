/** @fileoverview Time and date parsing tokens and utilities. */
import { InjectionToken } from '@angular/core';

/** Injection token that provides a function returning the current date and time. */
export const DATE_NOW = new InjectionToken<() => Date>('DATE_NOW', {
  providedIn: 'root',
  factory: () => () => new Date(Date.now()),
});

/**
 * Parses an ISO date or timestamp string into a `Date` instance, returning `null` when empty.
 *
 * @param raw - Optional ISO date or timestamp string.
 * @returns Parsed `Date` instance, or `null` if `raw` is null/empty.
 */
export function parseIsoDate(raw: string | null | undefined): Date | null {
  if (!raw) {
    return null;
  }
  return new Date(raw);
}

/**
 * Parses an ISO timestamp string into epoch milliseconds using `Date.parse`.
 *
 * @param raw - ISO timestamp string.
 * @returns Epoch milliseconds number.
 */
export function parseTimestampMillis(raw: string): number {
  return Date.parse(raw);
}
