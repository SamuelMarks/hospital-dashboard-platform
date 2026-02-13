/**
 * @fileoverview Unit tests for GlobalErrorHandler.
 */

import { TestBed } from '@angular/core/testing';
import { GlobalErrorHandler } from './global-error.handler';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Injector } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of } from 'rxjs';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  // Spy on console to keep test output clean from expected error logs
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Setup default mock return value to prevent "Cannot read properties of undefined (reading 'onAction')"
    const snackRefObj = { onAction: () => of(void 0) };
    mockSnackBar = { open: vi.fn().mockReturnValue(snackRefObj) };

    TestBed.configureTestingModule({
      providers: [GlobalErrorHandler, { provide: MatSnackBar, useValue: mockSnackBar }, Injector],
    });

    handler = TestBed.inject(GlobalErrorHandler);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should be created', () => {
    expect(handler).toBeTruthy();
  });

  it('should display snackbar for client-side errors', () => {
    const error = new Error('Client logic failure');

    handler.handleError(error);

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Application Error: Client logic failure',
      'Reload',
      expect.objectContaining({
        politeness: 'assertive',
        panelClass: ['snackbar-critical'],
      }),
    );
  });

  it('should ignore HttpErrorResponse (handled by interceptor)', () => {
    const httpError = new HttpErrorResponse({ status: 500 });
    handler.handleError(httpError);
    expect(mockSnackBar.open).not.toHaveBeenCalled();
  });

  it('should handle string errors', () => {
    handler.handleError('Simple string error');

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringMatching(/Simple string error/),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should handle rejection-wrapped errors', () => {
    handler.handleError({ rejection: new Error('Promise failed') });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringMatching(/Promise failed/),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should ignore HttpErrorResponse wrapped in rejection', () => {
    handler.handleError({ rejection: new HttpErrorResponse({ status: 500 }) });
    expect(mockSnackBar.open).not.toHaveBeenCalled();
  });

  it('should fall back to unknown runtime exception message', () => {
    handler.handleError({ foo: 'bar' });
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringMatching(/Unknown runtime exception/),
      'Reload',
      expect.anything(),
    );
  });

  it('should clear errors stream', () => {
    handler.errors$.next(new Error('boom'));
    handler.clearError();
    expect(handler.errors$.value).toBeNull();
  });

  it('should broadcast error to errors$ stream', () => {
    const error = new Error('Stream Test');

    // Subscribe to test emission
    let emitted: unknown;
    handler.errors$.subscribe((e) => (emitted = e));

    handler.handleError(error);
    expect(emitted).toBe(error);
  });

  it('should invoke reload on snackbar action', () => {
    const reloadSpy = vi.spyOn(handler as any, 'reloadApp');
    handler.handleError(new Error('Reload Test'));
    expect(reloadSpy).toHaveBeenCalled();
    reloadSpy.mockRestore();
  });
});
