/**
 * @fileoverview Main entry point for the Angular application.
 * Bootstraps the root component using the standalone application configuration.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/**
 * Bootstraps the standalone Angular application.
 *
 * Uses {@link App} as the root component and {@link appConfig} for dependency injection.
 * Catches and logs any bootstrap-time errors to the console.
 *
 * @returns {Promise<void>} A promise that resolves when the application is bootstrapped.
 */
bootstrapApplication(App, appConfig).catch((err: unknown) => {
  // Intentionally logging to console as this is the application root crash handler.
  console.error('Application Bootstrap Failed:', err);
});
