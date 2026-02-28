import { TestBed } from '@angular/core/testing';
import { adminGuard } from './admin.guard';
import { AuthService } from './auth.service';
import { PLATFORM_ID } from '@angular/core';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('adminGuard', () => {
  let routerMock: any;
  let authServiceMock: any;

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
        const result = adminGuard(null as any, null as any) as Observable<any>;
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
        const result = adminGuard(null as any, null as any) as Observable<any>;
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
        const result = adminGuard(null as any, null as any) as Observable<any>;
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
      const result = adminGuard(null as any, null as any);
      expect(result).toBe(true);
    });
  });
});
