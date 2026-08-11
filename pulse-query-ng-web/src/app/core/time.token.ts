/** @fileoverview Time token. */
import { InjectionToken } from '@angular/core';

/** @docs */
export const DATE_NOW = new InjectionToken<() => Date>('DATE_NOW', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
