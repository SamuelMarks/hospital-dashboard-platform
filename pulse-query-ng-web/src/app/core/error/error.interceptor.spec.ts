/**
 * @fileoverview Unit tests for ErrorInterceptor.
 */

import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptors,
  HttpClient,
  HttpErrorResponse,
  HttpRequest,
  withXhr,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorInterceptor } from './error.interceptor';
import { ConnectionStatusService } from '../health/connection-status.service';
import { of, throwError } from 'rxjs';

describe('errorInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };
  let mockConnectionService: {
    markBackendUnreachable: ReturnType<typeof vi.fn>;
    openDiagnosticsDialog: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockSnackBar = {
      open: vi.fn().mockReturnValue({
        onAction: () => of(undefined),
      }),
    };
    mockConnectionService = {
      markBackendUnreachable: vi.fn(),
      openDiagnosticsDialog: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: ConnectionStatusService, useValue: mockConnectionService },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should ignore 401 Unauthorized errors (no snackbar)', () => {
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockSnackBar.open).not.toHaveBeenCalled();
  });

  it('should handle status 0 network errors and mark backend unreachable', () => {
    httpClient.get('/api/test').subscribe({
      error: (err) => {
        expect(err.status).toBe(0);
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.error(new ProgressEvent('error'));

    expect(mockConnectionService.markBackendUnreachable).toHaveBeenCalled();
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringContaining('Cannot reach Pulse Query Backend server'),
      'Troubleshoot',
      expect.any(Object),
    );
    expect(mockConnectionService.openDiagnosticsDialog).toHaveBeenCalled();
  });

  it('should handle status 503 service unavailable with troubleshoot action', () => {
    httpClient.get('/api/test').subscribe({
      error: (err) => {
        expect(err.status).toBe(503);
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Database service unavailable. Backend database may be misconfigured.',
      'Troubleshoot',
      expect.any(Object),
    );
  });

  it('should format structured backend database errors with remediation hints', () => {
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(
      {
        code: 'TABLE_NOT_FOUND',
        message: 'Table missing.',
        remediation_hint: 'Run reingest.',
      },
      { status: 404, statusText: 'Not Found' },
    );

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Table missing. (Run reingest.)',
      'Close',
      expect.any(Object),
    );
  });

  it('should display snackbar for 500 Server Error', () => {
    const errorMsg = 'Internal Database Failure';

    httpClient.get('/api/test').subscribe({
      error: (err) => {
        expect(err.status).toBe(500);
      },
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ detail: errorMsg }, { status: 500, statusText: 'Server Error' });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      errorMsg,
      'Close',
      expect.objectContaining({
        politeness: 'assertive',
        panelClass: ['snackbar-error'],
      }),
    );
  });

  it('should handle validation errors (array detail)', () => {
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush(
      { detail: [{ loc: ['body', 'email'], msg: 'Invalid email' }] },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Validation Error: Check input fields.',
      'Close',
      expect.any(Object),
    );
  });

  it('should fall back to error.message when error body is not an object', () => {
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Server down', { status: 500, statusText: 'Server Error' });

    const message = mockSnackBar.open.mock.calls[0][0] as string;
    expect(message).toContain('Http failure response');
  });

  it('should use default message when detail is missing', () => {
    httpClient.get('/api/test').subscribe({
      error: () => {},
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ foo: 'bar' }, { status: 500, statusText: 'Server Error' });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'An unexpected error occurred.',
      'Close',
      expect.any(Object),
    );
  });

  it('should use error.message when error body is null', () => {
    const error = new HttpErrorResponse({
      status: 500,
      statusText: 'Server Error',
      url: '/api/test',
    });
    const req = new HttpRequest('GET', '/api/test');

    const result$ = TestBed.runInInjectionContext(() =>
      errorInterceptor(req, () => throwError(() => error)),
    );

    result$.subscribe({ error: () => {} });

    expect(mockSnackBar.open).toHaveBeenCalledWith(error.message, 'Close', expect.any(Object));
  });

  it('should use default message when error body is non-object and message missing', () => {
    const error = { status: 500, error: 'boom', message: '' } as HttpErrorResponse;
    const req = new HttpRequest('GET', '/api/test');

    const result$ = TestBed.runInInjectionContext(() =>
      errorInterceptor(req, () => throwError(() => error)),
    );

    result$.subscribe({ error: () => {} });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'An unexpected error occurred.',
      'Close',
      expect.any(Object),
    );
  });
});
