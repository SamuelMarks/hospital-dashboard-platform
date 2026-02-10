import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

describe('serverRoutes', () => {
  it('marks protected routes as client-rendered', () => {
    const protectedPaths = ['', 'dashboard/:id', 'chat', 'simulation'];
    protectedPaths.forEach((path) => {
      const route = serverRoutes.find((r) => r.path === path);
      expect(route).toBeTruthy();
      expect(route?.renderMode).toBe(RenderMode.Client);
    });
  });

  it('marks public routes as prerendered and includes fallback', () => {
    const loginRoute = serverRoutes.find((r) => r.path === 'login');
    const registerRoute = serverRoutes.find((r) => r.path === 'register');
    const fallbackRoute = serverRoutes.find((r) => r.path === '**');

    expect(loginRoute?.renderMode).toBe(RenderMode.Prerender);
    expect(registerRoute?.renderMode).toBe(RenderMode.Prerender);
    expect(fallbackRoute?.renderMode).toBe(RenderMode.Prerender);
  });
});
