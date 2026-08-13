/** @fileoverview Time token. */
import { InjectionToken } from '@angular/core';

/** Injection token that provides a function returning the current date and time. */
export const DATE_NOW = new InjectionToken<() => Date>('DATE_NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
