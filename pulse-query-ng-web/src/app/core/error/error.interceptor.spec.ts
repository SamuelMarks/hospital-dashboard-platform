/**
 * @fileoverview Unit tests for ErrorInterceptor.
 */

import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSnackBar = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: MatSnackBar, useValue: mockSnackBar }
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should ignore 401 Unauthorized errors (no snackbar)', () => {
    httpClient.get('/api/test').subscribe({
      error: () => { }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(mockSnackBar.open).not.toHaveBeenCalled();
  });

  it('should display snackbar for 500 Server Error', () => {
    const errorMsg = 'Internal Database Failure';

    httpClient.get('/api/test').subscribe({
      error: (err) => {
        expect(err.status).toBe(500);
      }
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ detail: errorMsg }, { status: 500, statusText: 'Server Error' });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      errorMsg,
      'Close',
      expect.objectContaining({ 
        politeness: 'assertive',
        panelClass: ['snackbar-error'] 
      })
    );
  });

  it('should handle validation errors (array detail)', () => {
    httpClient.get('/api/test').subscribe({
      error: () => {}
    });

    const req = httpMock.expectOne('/api/test');
    req.flush({ detail: [{ loc: ['body', 'email'], msg: 'Invalid email' }] }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Validation Error: Check input fields.',
      'Close',
      expect.any(Object)
    );
  });
});