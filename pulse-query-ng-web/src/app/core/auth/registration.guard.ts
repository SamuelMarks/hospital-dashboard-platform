/* v8 ignore start */
/** @docs */
/**
 * @fileoverview Route Guard for the Registration Page via Feature Flag.
 */

import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Prevents access to the Public Registration page if the feature is disabled in the environment.
 *
 * Logic:
 * 1. Checks `environment.registrationEnabled`.
 * 2. If false, redirects to the Login page.
 *
 * @param {import('@angular/router').ActivatedRouteSnapshot} route - The activated route snapshot.
 * @param {import('@angular/router').RouterStateSnapshot} state - The router state snapshot.
 * @returns {boolean | UrlTree} true if allowed, or a UrlTree redirecting to login.
 */
export const registrationGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  const router = inject(Router);

  if (environment.registrationEnabled) {
    return true;
  }

  // Feature is disabled, redirect to login
  return router.createUrlTree(['/login']);
};
