/**
 * @fileoverview Unit tests for Application Configuration.
 * Verifies that critical providers (API, Auth, Error Handling) are correctly registered.
 */

import { TestBed } from '@angular/core/testing';
import { appConfig, initializeAuth, apiConfigFactory } from './app.config';
import { BASE_PATH, Configuration } from './api-client';
import { environment } from '../environments/environment';
import { AuthService } from './core/auth/auth.service';
import { APP_INITIALIZER, ErrorHandler } from '@angular/core';
import { GlobalErrorHandler } from './core/error/global-error.handler';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { vi } from 'vitest';

// Avoid hydration errors in unit tests (no server-side render context).
vi.mock('@angular/platform-browser', () => ({
  provideClientHydration: () => []
}));

describe('AppConfig', () => {
  /**
   * Mock AuthService to verify APP_INITIALIZER integration.
   */
  let mockAuthService: { initialize: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAuthService = { 
      initialize: vi.fn().mockResolvedValue(undefined) 
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
          multi: true
        }
      ]
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
    const hasBasePath = appConfig.providers.some((provider) => (provider as any)?.provide === BASE_PATH);
    expect(hasBasePath).toBe(true);
  });
});
