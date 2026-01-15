/**
 * @fileoverview Route Guard for protecting authenticated routes.
 */

import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, isPlatformServer } from '@angular/common';
import { AuthService } from './auth.service';

/**
 * Functional Route Guard to protect routes requiring authentication.
 * 
 * Logic:
 * 1. **Server-Side Bypass**: If running on the Server, allow access.
 *    This prevents the Server from redirecting to /login because it lacks access to localStorage.
 *    The actual security logic is enforced on the client after hydration.
 * 2. **Client-Side Check**:
 *    a. Check `isAuthenticated()` (In-memory reactive state).
 *    b. Check `hasStoredToken()` (Persistence fallback for F5 Refresh).
 * 3. **Fallback**: Redirect to `/login` with `returnUrl` parameter.
 * 
 * @param {import('@angular/router').ActivatedRouteSnapshot} route - The activated route snapshot.
 * @param {import('@angular/router').RouterStateSnapshot} state - The router state snapshot.
 * @returns {boolean | UrlTree} true if allowed, or a UrlTree redirecting to login.
 */
export const authGuard: CanActivateFn = (route, state): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // 1. Server-Side: Always Allow (Defer to Client)
  if (isPlatformServer(platformId)) {
    return true;
  }

  // 2. Client-Side: Check State (Primary)
  if (authService.isAuthenticated()) {
    return true;
  }

  // 3. Client-Side: Check Storage (Persistence for Refresh)
  if (authService.hasStoredToken()) {
    return true; // Optimistic allow; Service will validate token async
  }

  // 4. Not Authenticated
  return router.createUrlTree(['/login'], { 
    queryParams: { returnUrl: state.url } 
  });
};