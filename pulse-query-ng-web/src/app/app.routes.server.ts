/**
 * @fileoverview Server routing configuration mapping Angular routes to SSR `RenderMode` strategies.
 */

import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Server routes array defining `RenderMode.Client` for authenticated routes and
 * `RenderMode.Prerender` for public static routes.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Client,
  },
  {
    path: 'dashboard/:id',
    renderMode: RenderMode.Client,
  },
  {
    path: 'chat',
    renderMode: RenderMode.Client,
  },
  {
    path: 'analytics',
    renderMode: RenderMode.Client,
  },
  {
    path: 'simulation',
    renderMode: RenderMode.Client,
  },
  {
    path: 'login',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'register',
    renderMode: RenderMode.Prerender,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
