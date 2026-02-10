/**
 * @fileoverview Unit tests for AuthGuard.
 */

import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PLATFORM_ID } from '@angular/core';

describe('authGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
      TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  let mockAuthService: { 
    isAuthenticated: ReturnType<typeof vi.fn>; 
    hasStoredToken: ReturnType<typeof vi.fn>; 
  };
  let mockRouter: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAuthService = { 
      isAuthenticated: vi.fn(),
      hasStoredToken: vi.fn()
    };
    
    mockRouter = { 
      createUrlTree: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    });
  });

  it('should allow access if user is authenticated via signal', () => {
    mockAuthService.isAuthenticated.mockReturnValue(true);

    const result = executeGuard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should allow access if user has stored token (optimistic)', () => {
    mockAuthService.isAuthenticated.mockReturnValue(false);
    mockAuthService.hasStoredToken.mockReturnValue(true);

    const result = executeGuard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should redirect to login if not authenticated', () => {
    mockAuthService.isAuthenticated.mockReturnValue(false);
    mockAuthService.hasStoredToken.mockReturnValue(false);
    
    const mockUrlTree = {} as UrlTree;
    mockRouter.createUrlTree.mockReturnValue(mockUrlTree);

    const result = executeGuard({} as any, { url: '/protected' } as any);
    
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/login'], { 
      queryParams: { returnUrl: '/protected' } 
    });
    expect(result).toBe(mockUrlTree);
  });

  it('should allow access on the server platform', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    });

    const result = executeGuard({} as any, {} as any);
    expect(result).toBe(true);
  });
});
