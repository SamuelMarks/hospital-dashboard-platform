/**
 * @fileoverview Unit tests for server application configuration (`app.config.server.ts`).
 */

import { appConfig } from './app.config';
import { config } from './app.config.server';
import { routes } from './app.routes';
import { serverRoutes } from './app.routes.server';
import { BASE_PATH } from './api-client';

describe('server app config', () => {
  it('merges server providers with base app config and covers all client routes', () => {
    expect(config).toBeTruthy();
    expect(Array.isArray(config.providers)).toBe(true);
    expect(config.providers?.length).toBeGreaterThan(appConfig.providers?.length || 0);

    const hasBasePath = config.providers.some(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === BASE_PATH,
    );
    expect(hasBasePath).toBe(true);

    const serverPaths = new Set(serverRoutes.map((r) => r.path));
    expect(serverPaths.has('**')).toBe(true);
    for (const clientRoute of routes) {
      if (clientRoute.path !== undefined) {
        expect(serverPaths.has(clientRoute.path) || serverPaths.has('**')).toBe(true);
      }
    }
  });
});
