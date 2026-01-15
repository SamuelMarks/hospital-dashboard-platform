import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Server Routing Configuration.
 * 
 * Maps specific Angular Routes to a Rendering Strategy.
 * 
 * Strategies:
 * - RenderMode.Prerender: Static HTML generated at build time (Login, Register).
 * - RenderMode.Client: Server sends empty shell; Browser renders. Required for AuthGuard + LocalStorage.
 * - RenderMode.Server: Dynamic HTML generated on Node.js per request.
 */
export const serverRoutes: ServerRoute[] = [
  // 1. Home Page (Protected) -> Client Render (so it can read token)
  {
    path: '',
    renderMode: RenderMode.Client
  },

  // 2. Dashboard Details (Protected) -> Client Render (so it can read token)
  {
    path: 'dashboard/:id',
    renderMode: RenderMode.Client
  },

  // 3. Public Pages -> Prerender (Instant Load, SEO neutral)
  {
    path: 'login',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'register',
    renderMode: RenderMode.Prerender
  },

  // 4. Fallback (404s)
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];