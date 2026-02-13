import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Server Routing Configuration.
 *
 * Maps specific Angular Routes to a Rendering Strategy (SSR/hydration).
 *
 * Strategies:
 * - RenderMode.Prerender: Static HTML generated at build time (Login, Register).
 * - RenderMode.Client: Server sends empty shell; Browser renders. Required for AuthGuard + LocalStorage.
 * - RenderMode.Server: Dynamic HTML generated on Node.js per request.
 *
 * FIX:
 * Protected routes must be marked as `RenderMode.Client`.
 * If they default to `Prerender` (via `**`), the server tries to render them,
 * hits the AuthGuard (which allows it on server), but then fails to execute
 * API calls (missing token) or redirects, resulting in "Cannot GET /path" errors
 * or internal 500s during the SSR process on refresh.
 */
export const serverRoutes: ServerRoute[] = [
  // --- Protected Routes (Client Side Only) ---
  // These require LocalStorage access for the JWT, which doesn't exist on the server.
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

  // --- Public Routes (Prerendered) ---
  // These are static shells that can be generated at build time for performance.
  {
    path: 'login',
    renderMode: RenderMode.Prerender,
  },
  {
    path: 'register',
    renderMode: RenderMode.Prerender,
  },

  // --- Fallback ---
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
