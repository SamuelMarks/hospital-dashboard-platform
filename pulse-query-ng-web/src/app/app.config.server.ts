/**
 * @fileoverview Server-side `ApplicationConfig` merging browser providers with SSR route providers.
 */

import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/** Server-only providers enabling SSR route rendering strategies. */
const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
};

/** Merged application configuration used by `main.server.ts`. */
export const config: ApplicationConfig = mergeApplicationConfig(appConfig, serverConfig);
