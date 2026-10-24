/**
 * @fileoverview Main Application Configuration.
 * Defines dependency injection providers, global error handling,
 * routing settings, and performance tuning options for the Angular application.
 */

import {
  ApplicationConfig,
  APP_INITIALIZER,
  ErrorHandler,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
  withRouterConfig,
  TitleStrategy,
} from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { MatPaginatorIntl } from '@angular/material/paginator';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/error/error.interceptor';
import { AuthService } from './core/auth/auth.service';
import { Configuration, BASE_PATH } from './api-client';
import { GlobalErrorHandler } from './core/error/global-error.handler';
import { environment } from '../environments/environment';
import { A11yTitleStrategy } from './core/accessibility/a11y-title-strategy';

/**
 * Factory function to initialize Authentication State on startup.
 * Checks for existing tokens in local storage before the router bootstraps
 * effectively blocking application load until auth state is resolved.
 *
 * @param authService - The injected AuthService singleton.
 * @returns A promise-returning function required by APP_INITIALIZER.
 */
export function initializeAuth(authService: Pick<AuthService, 'initialize'>): () => Promise<void> {
  return () => authService.initialize();
}

/**
 * Factory function to configure the OpenAPI Client.
 * Reads the API URL from the Angular Environment configuration.
 *
 * Design Decision:
 * Using a factory ensures strict type safety for the Configuration object
 * and allows dynamic resolution of the base path at runtime.
 *
 * @returns {Configuration} A standardized Configuration instance for the API Client.
 */
export function apiConfigFactory(): Configuration {
  return new Configuration({
    basePath: environment.apiUrl,
    // Credentials (e.g. cookies) can be enabled here if switching away from Bearer tokens
    withCredentials: false,
  });
}

/**
 * Factory function to create a localized `MatPaginatorIntl` instance using `$localize`.
 *
 * @returns Localized `MatPaginatorIntl` instance for Material data tables.
 */
export function createLocalizedPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = $localize`Items per page:`;
  intl.nextPageLabel = $localize`Next page`;
  intl.previousPageLabel = $localize`Previous page`;
  intl.firstPageLabel = $localize`First page`;
  intl.lastPageLabel = $localize`Last page`;
  intl.getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return $localize`0 of ${length}`;
    }
    const normalizedLength = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex =
      startIndex < normalizedLength
        ? Math.min(startIndex + pageSize, normalizedLength)
        : startIndex + pageSize;
    return $localize`${startIndex + 1} – ${endIndex} of ${normalizedLength}`;
  };
  return intl;
}

/**
 * Application Configuration Object.
 *
 * Defines the providers for the standalone application lifecycle.
 *
 * Key Definitions:
 * - **Change Detection**: Enabled Experimental Zoneless Change Detection (No Zone.js).
 * - **Router**: Enabled with Component Input Binding (Router Params -> Inputs) and View Transitions.
 * - **HTTP**: Uses modern `fetch` backend with functional interceptors.
 * - **API**: Auto-generated OpenAPI client configured via factory unique to the environment.
 * - **Error Handling**: Global strategy replacing the default handler.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    // Enable Zoneless mode to remove dependency on Zone.js
    provideZonelessChangeDetection(),

    provideRouter(
      routes,
      // Binds route parameters (e.g., :id) directly to component inputs
      withComponentInputBinding(),
      // Provides smooth transitions between routes (Angular 17+)
      withViewTransitions(),
      // Strict parameter handling
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),

    { provide: TitleStrategy, useClass: A11yTitleStrategy },

    provideClientHydration(withNoIncrementalHydration()),

    // HTTP Stack with Functional Interceptors
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor])),

    // Global Runtime Error Handler
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler,
    },

    // Auth Initialization (Bootstrap Blocker)
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [AuthService],
      multi: true,
    },

    // API Client Configuration
    // 1. Provide the BASE_PATH token for services that inject it directly
    {
      provide: BASE_PATH,
      useValue: environment.apiUrl,
    },
    // 2. Provide the Configuration using our dynamic factory
    {
      provide: Configuration,
      useFactory: apiConfigFactory,
    },
    // 3. Localized Material Paginator labels
    {
      provide: MatPaginatorIntl,
      useFactory: createLocalizedPaginatorIntl,
    },
  ],
};
