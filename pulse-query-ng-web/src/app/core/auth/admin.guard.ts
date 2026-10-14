/**
 * @fileoverview Route guard restricting navigation to administrative users.
 */

import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { AuthService } from './auth.service';
import { map, take, Observable, filter } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

/**
 * Functional route guard that verifies whether the current user holds administrative privileges.
 * Redirects non-admin users to the home route (`/`).
 *
 * @param route - Activated route snapshot being checked.
 * @param state - Router state snapshot for the target navigation.
 * @returns Boolean or observable emitting `true` if authorized, or a `UrlTree` redirecting to `/`.
 */
export const adminGuard: CanActivateFn = (
  route,
  state,
): Observable<boolean | UrlTree> | boolean => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (isPlatformServer(platformId)) {
    return true;
  }

  const user$ = toObservable(authService.currentUser);

  return user$.pipe(
    // Wait until user is either populated OR there is no token (meaning they aren't logging in)
    filter((user) => user !== null || !authService.hasStoredToken()),
    map((user) => {
      if (user && (user.is_admin || ('role' in user && user.role === 'SUPER_ADMIN'))) {
        return true;
      }
      return router.createUrlTree(['/']);
    }),
    take(1),
  );
};
