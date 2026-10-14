import { TestBed } from '@angular/core/testing';
import { adminGuard } from './admin.guard';
import { AuthService } from './auth.service';
import { PLATFORM_ID, signal, WritableSignal } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('adminGuard', () => {
  let routerMock: { createUrlTree: ReturnType<typeof vi.fn> };
  let authServiceMock: {
    currentUser: WritableSignal<{ is_admin?: boolean; role?: string } | null>;
    hasStoredToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    routerMock = {
      createUrlTree: vi.fn().mockReturnValue('mockTree'),
    };

    authServiceMock = {
      currentUser: signal(null),
      hasStoredToken: vi.fn().mockReturnValue(false),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
  });

  it('should redirect non-admin user', () => {
    return new Promise<void>((resolve) => {
      authServiceMock.currentUser.set({ is_admin: false });
      authServiceMock.hasStoredToken.mockReturnValue(true);

      TestBed.runInInjectionContext(() => {
        const result = adminGuard(
          {} as ActivatedRouteSnapshot,
          {} as RouterStateSnapshot,
        ) as Observable<boolean | UrlTree>;
        result.subscribe((val) => {
          expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/']);
          expect(val).toBe('mockTree');
          resolve();
        });
      });
    });
  });

  it('should allow admin user', () => {
    return new Promise<void>((resolve) => {
      authServiceMock.currentUser.set({ is_admin: true });
      authServiceMock.hasStoredToken.mockReturnValue(true);

      TestBed.runInInjectionContext(() => {
        const result = adminGuard(
          {} as ActivatedRouteSnapshot,
          {} as RouterStateSnapshot,
        ) as Observable<boolean | UrlTree>;
        result.subscribe((val) => {
          expect(val).toBe(true);
          resolve();
        });
      });
    });
  });

  it('should allow super admin user by role', () => {
    return new Promise<void>((resolve) => {
      authServiceMock.currentUser.set({ is_admin: false, role: 'SUPER_ADMIN' });
      authServiceMock.hasStoredToken.mockReturnValue(true);

      TestBed.runInInjectionContext(() => {
        const result = adminGuard(
          {} as ActivatedRouteSnapshot,
          {} as RouterStateSnapshot,
        ) as Observable<boolean | UrlTree>;
        result.subscribe((val) => {
          expect(val).toBe(true);
          resolve();
        });
      });
    });
  });

  it('should redirect if no token and no user', () => {
    return new Promise<void>((resolve) => {
      authServiceMock.currentUser.set(null);
      authServiceMock.hasStoredToken.mockReturnValue(false);

      TestBed.runInInjectionContext(() => {
        const result = adminGuard(
          {} as ActivatedRouteSnapshot,
          {} as RouterStateSnapshot,
        ) as Observable<boolean | UrlTree>;
        result.subscribe((val) => {
          expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/']);
          expect(val).toBe('mockTree');
          resolve();
        });
      });
    });
  });

  it('should return true on server platform', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    TestBed.runInInjectionContext(() => {
      const result = adminGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot);
      expect(result).toBe(true);
    });
  });
});
