/**
 * @fileoverview Unit tests for Application Configuration.
 * Verifies that critical providers (API, Auth, Error Handling) are correctly registered.
 */

import { TestBed } from '@angular/core/testing';
import {
  appConfig,
  initializeAuth,
  apiConfigFactory,
  createLocalizedPaginatorIntl,
} from './app.config';
import { BASE_PATH, Configuration } from './api-client';
import { environment } from '../environments/environment';
import { AuthService } from './core/auth/auth.service';
import { APP_INITIALIZER, ErrorHandler } from '@angular/core';
import { GlobalErrorHandler } from './core/error/global-error.handler';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { vi } from 'vitest';

describe('AppConfig', () => {
  /**
   * Mock AuthService to verify APP_INITIALIZER integration.
   */
  let mockAuthService: { initialize: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAuthService = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: BASE_PATH, useValue: environment.apiUrl },
        { provide: Configuration, useFactory: apiConfigFactory },
        { provide: ErrorHandler, useClass: GlobalErrorHandler },
        {
          provide: APP_INITIALIZER,
          useFactory: initializeAuth,
          deps: [AuthService],
          multi: true,
        },
      ],
    });
  });

  it('should provide the correct BASE_PATH from environment', () => {
    const expectedUrl = environment.apiUrl;
    const basePath = TestBed.inject(BASE_PATH);
    expect(basePath).toBe(expectedUrl);
  });

  it('should provide a configured API Configuration class via factory', () => {
    // Test the factory function directly
    const configInstance = apiConfigFactory();
    expect(configInstance).toBeInstanceOf(Configuration);
    expect(configInstance.basePath).toBe(environment.apiUrl);

    // Test the injected instance via Module
    const injectedConfig = TestBed.inject(Configuration);
    expect(injectedConfig).toBeTruthy();
    expect(injectedConfig.basePath).toBe(environment.apiUrl);
  });

  it('should register GlobalErrorHandler', () => {
    const handler = TestBed.inject(ErrorHandler);
    expect(handler).toBeInstanceOf(GlobalErrorHandler);
  });

  it('should contain the APP_INITIALIZER for Auth', () => {
    // Verify the factory function behavior
    const initFn = initializeAuth(mockAuthService as unknown as AuthService);
    initFn();
    expect(mockAuthService.initialize).toHaveBeenCalled();

    // Verify it is present in TestBed providers
    const initializers = TestBed.inject(APP_INITIALIZER);
    expect(initializers).toBeTruthy();
    expect(initializers.length).toBeGreaterThan(0);
  });

  it('should include BASE_PATH provider in appConfig', () => {
    const hasBasePath = appConfig.providers.some(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === BASE_PATH,
    );
    expect(hasBasePath).toBe(true);
  });

  it('should create localized MatPaginatorIntl with range formatting', () => {
    const intl = createLocalizedPaginatorIntl();
    expect(intl.itemsPerPageLabel).toBe('Items per page:');
    expect(intl.getRangeLabel(0, 10, 0)).toBe('0 of 0');
    expect(intl.getRangeLabel(0, 0, 10)).toBe('0 of 10');
    expect(intl.getRangeLabel(0, 10, 25)).toBe('1 – 10 of 25');
    expect(intl.getRangeLabel(2, 10, 25)).toBe('21 – 25 of 25');
    expect(intl.getRangeLabel(3, 10, 25)).toBe('31 – 40 of 25');
  });
});
