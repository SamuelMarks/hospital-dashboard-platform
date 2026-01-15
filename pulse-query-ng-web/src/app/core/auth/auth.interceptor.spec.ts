/**
 * @fileoverview Unit tests for AuthInterceptor.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let mockAuthService: { 
    getToken: ReturnType<typeof vi.fn>; 
    logout: ReturnType<typeof vi.fn>; 
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn>; routerState: any };

  beforeEach(() => {
    mockAuthService = { 
      getToken: vi.fn(),
      logout: vi.fn()
    };
    
    mockRouter = { 
      navigate: vi.fn(),
      routerState: { snapshot: { url: '/dashboard/123' } }
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should add Authorization header when token exists', () => {
    mockAuthService.getToken.mockReturnValue('valid-token');

    httpClient.get('/api/data').subscribe();

    const req = httpMock.expectOne('/api/data');
    expect(req.request.headers.get('Authorization')).toBe('Bearer valid-token');
  });

  it('should separate logic: should NOT add header if token is missing', () => {
    mockAuthService.getToken.mockReturnValue(null);

    httpClient.get('/api/public').subscribe();

    const req = httpMock.expectOne('/api/public');
    expect(req.request.headers.has('Authorization')).toBe(false);
  });

  it('should redirect to login on 401 response', () => {
    mockAuthService.getToken.mockReturnValue('expired-token');

    httpClient.get('/api/protected').subscribe({
      error: (err) => {
        expect(err.status).toBe(401);
      }
    });

    const req = httpMock.expectOne('/api/protected');
    req.flush('Token Expired', { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.logout).toHaveBeenCalledWith(false);
    
    expect(mockRouter.navigate).toHaveBeenCalledWith(
        ['/login'], 
        { queryParams: { returnUrl: '/dashboard/123' } }
    );
  });

  it('should NOT redirect on 401 if request url is login endpoint', () => {
    httpClient.post('/api/auth/login', {}).subscribe({
      error: (err) => expect(err.status).toBe(401)
    });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush('Bad Creds', { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.logout).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });
});