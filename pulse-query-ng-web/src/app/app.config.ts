/**
 * @fileoverview Main Application Configuration.
 * Defines dependency injection providers, global error handling,
 * routing settings, and performance tuning options for the Angular application.
 */

import {
  ApplicationConfig,
  importProvidersFrom,
  APP_INITIALIZER,
  ErrorHandler,
  provideZonelessChangeDetection
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withViewTransitions,
  withRouterConfig
} from '@angular/router';
import {
  provideHttpClient,
  withInterceptors,
  withFetch
} from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/error/error.interceptor';
import { AuthService } from './core/auth/auth.service';
import { ApiModule, Configuration, BASE_PATH } from './api-client';
import { GlobalErrorHandler } from './core/error/global-error.handler';
import { environment } from '../environments/environment';

/**
 * Factory function to initialize Authentication State on startup.
 * Checks for existing tokens in local storage before the router bootstraps
 * effectively blocking application load until auth state is resolved.
 *
 * @param {AuthService} authService - The injected AuthService singleton.
 * @returns {() => Promise<void>} A promise-returning function required by APP_INITIALIZER.
 */
export function initializeAuth(authService: AuthService): () => Promise<void> {
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
    withCredentials: false
  });
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
      // Binds route parameters (e.g., :id) directly to component @Input() signals
      withComponentInputBinding(),
      // Provides smooth transitions between routes (Angular 17+)
      withViewTransitions(),
      // Strict parameter handling
      withRouterConfig({ paramsInheritanceStrategy: 'always' })
    ),

    provideClientHydration(),
    provideAnimationsAsync(),

    // HTTP Stack with Functional Interceptors
    provideHttpClient(
      withFetch(),
      withInterceptors([
        authInterceptor,
        errorInterceptor
      ])
    ),

    // Global Runtime Error Handler
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler
    },

    // Auth Initialization (Bootstrap Blocker)
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [AuthService],
      multi: true
    },

    // API Client Configuration
    // 1. Provide the BASE_PATH token for services that inject it directly
    {
      provide: BASE_PATH,
      useValue: environment.apiUrl
    },
    // 2. Import the ApiModule using our dynamic factory
    importProvidersFrom(ApiModule.forRoot(apiConfigFactory))
  ]
};
