/**
 * @fileoverview Unit tests for RegistrationGuard.
 */

import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { registrationGuard } from './registration.guard';
import { environment } from '../../../environments/environment';

describe('registrationGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
      TestBed.runInInjectionContext(() => registrationGuard(...guardParameters));

  let mockRouter: { createUrlTree: ReturnType<typeof vi.fn> };
  const originalState = environment.registrationEnabled;

  beforeEach(() => {
    mockRouter = { createUrlTree: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter }
      ]
    });
  });

  afterEach(() => {
    environment.registrationEnabled = originalState; // Restore
  });

  it('should allow access if environment.registrationEnabled is true', () => {
    environment.registrationEnabled = true;
    const result = executeGuard({} as any, {} as any);
    expect(result).toBe(true);
  });

  it('should redirect to login if environment.registrationEnabled is false', () => {
    environment.registrationEnabled = false;
    const mockUrlTree = {} as UrlTree;
    mockRouter.createUrlTree.mockReturnValue(mockUrlTree);

    const result = executeGuard({} as any, {} as any);
    
    expect(mockRouter.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe(mockUrlTree);
  });
});