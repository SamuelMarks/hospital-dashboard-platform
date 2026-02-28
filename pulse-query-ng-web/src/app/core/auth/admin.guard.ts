import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { AuthService } from './auth.service';
import { map, take, Observable, filter } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

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
      if (user && user.is_admin) {
        return true;
      }
      return router.createUrlTree(['/']);
    }),
    take(1),
  );
};
