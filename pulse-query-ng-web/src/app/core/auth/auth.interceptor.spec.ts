/**
 * @fileoverview Unit tests for AuthInterceptor.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { HttpRequest } from '@angular/common/http';
import { of, throwError } from 'rxjs';

describe('authInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let mockAuthService: {
    getToken: ReturnType<typeof vi.fn>;
    getRefreshToken: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn>; routerState: any; url: string };

  beforeEach(() => {
    mockAuthService = {
      getToken: vi.fn(),
      getRefreshToken: vi.fn().mockReturnValue(null),
      refreshToken: vi.fn(),
      logout: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
      routerState: { snapshot: { url: '/dashboard/123' } },
      url: '/dashboard/123',
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
      ],
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
      },
    });

    const req = httpMock.expectOne('/api/protected');

    // Simulate 401
    req.flush('Token Expired', { status: 401, statusText: 'Unauthorized' });

    // Interceptor tasks
    expect(mockAuthService.logout).toHaveBeenCalledWith(false);

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/dashboard/123' },
    });
  });

  it('should default returnUrl to root when snapshot url empty', () => {
    mockAuthService.getToken.mockReturnValue('expired-token');
    mockRouter.routerState.snapshot.url = '';

    httpClient.get('/api/protected').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/protected');
    req.flush('Token Expired', { status: 401, statusText: 'Unauthorized' });

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/' },
    });
  });

  it('should fallback to root returnUrl when snapshot url empty', () => {
    mockAuthService.getToken.mockReturnValue('expired-token');
    mockRouter.routerState.snapshot.url = '';
    mockRouter.url = '/somewhere';

    httpClient.get('/api/protected').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/protected');
    req.flush('Token Expired', { status: 401, statusText: 'Unauthorized' });

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/' },
    });
  });

  it('should NOT redirect on 401 if request url is login endpoint', () => {
    // Logic bypass check
    mockRouter.url = '/login';

    httpClient.post('/api/auth/login', {}).subscribe({
      error: (err) => expect(err.status).toBe(401),
    });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush('Bad Creds', { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.logout).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should not logout on non-401 errors', () => {
    mockAuthService.getToken.mockReturnValue('token');

    httpClient.get('/api/fail').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/fail');
    req.flush('Boom', { status: 500, statusText: 'Server Error' });

    expect(mockAuthService.logout).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should handle duck-typed 401 errors', () => {
    const result$ = TestBed.runInInjectionContext(() => {
      const req = new HttpRequest('GET', '/api/duck');
      return authInterceptor(req, () => throwError(() => ({ status: 401 }) as any));
    });

    result$.subscribe({ error: () => {} });
    expect(mockAuthService.logout).toHaveBeenCalledWith(false);
  });

  it('should refresh token and retry request on 401 when refresh token is present', () => {
    mockAuthService.getToken.mockReturnValue('expired-access');
    mockAuthService.getRefreshToken.mockReturnValue('valid-refresh');
    mockAuthService.refreshToken.mockReturnValue(
      of({ access_token: 'new-access-token', token_type: 'bearer' }),
    );

    let responseData: any = null;
    httpClient.get('/api/protected-data').subscribe((data) => (responseData = data));

    // First request fails with 401
    const req1 = httpMock.expectOne('/api/protected-data');
    expect(req1.request.headers.get('Authorization')).toBe('Bearer expired-access');
    req1.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    // Refresh token service was called
    expect(mockAuthService.refreshToken).toHaveBeenCalled();

    // Retried request is issued with new access token
    const retryReq = httpMock.expectOne('/api/protected-data');
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    retryReq.flush({ success: true });

    expect(responseData).toEqual({ success: true });
  });

  it('should logout and redirect when token refresh fails', () => {
    mockAuthService.getToken.mockReturnValue('expired-access');
    mockAuthService.getRefreshToken.mockReturnValue('expired-refresh');
    mockAuthService.refreshToken.mockReturnValue(throwError(() => new Error('Refresh failed')));

    httpClient.get('/api/protected-data').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/protected-data');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.logout).toHaveBeenCalledWith(false);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/dashboard/123' },
    });
  });

  it('should handle concurrent 401 requests by subscribing to single refresh and retrying all', () => {
    mockAuthService.getToken.mockReturnValue('expired-access');
    mockAuthService.getRefreshToken.mockReturnValue('valid-refresh');
    mockAuthService.refreshToken.mockReturnValue(
      of({ access_token: 'new-shared-access-token', token_type: 'bearer' }),
    );

    let res1: any = null;
    let res2: any = null;

    httpClient.get('/api/widget-1').subscribe((d) => (res1 = d));
    httpClient.get('/api/widget-2').subscribe((d) => (res2 = d));

    const req1 = httpMock.expectOne('/api/widget-1');
    const req2 = httpMock.expectOne('/api/widget-2');

    req1.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    req2.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    const retry1 = httpMock.expectOne('/api/widget-1');
    const retry2 = httpMock.expectOne('/api/widget-2');

    expect(retry1.request.headers.get('Authorization')).toBe('Bearer new-shared-access-token');
    expect(retry2.request.headers.get('Authorization')).toBe('Bearer new-shared-access-token');

    retry1.flush({ widget: 1 });
    retry2.flush({ widget: 2 });

    expect(res1).toEqual({ widget: 1 });
    expect(res2).toEqual({ widget: 2 });
  });
});
