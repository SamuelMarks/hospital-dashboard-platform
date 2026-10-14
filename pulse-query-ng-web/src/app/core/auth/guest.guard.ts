/**
 * @fileoverview Route Guard for guest-only routes (Login, Register).
 */

import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Endpoint protection to prevent authenticated users from accessing "Guest-Only" pages.
 *
 * Logic:
 * 1. Checks if the user is currently authenticated via {@link AuthService}.
 * 2. If authenticated, redirects them to the Dashboard view (`/`).
 * 3. If not authenticated, allows access to the route.
 *
 * This is the inverse logic of {@link authGuard}.
 *
 * @param {import('@angular/router').ActivatedRouteSnapshot} route - The activated route snapshot.
 * @param {import('@angular/router').RouterStateSnapshot} state - The router state snapshot.
 * @returns {boolean | UrlTree} true if access is allowed, or a UrlTree redirecting to Home.
 */
export const guestGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If the user IS logged in, kick them out of the guest page (Login/Register)
  if (authService.isAuthenticated()) {
    return router.createUrlTree(['/']);
  }

  // If user is a guest, allow access
  return true;
};
