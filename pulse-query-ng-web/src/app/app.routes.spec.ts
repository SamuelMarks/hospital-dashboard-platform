/**
 * @fileoverview Unit tests for Application Routes.
 * Verifies route paths, lazy loading functions, and guard assignments.
 * Includes mocks for material-color-utilities to prevent import resolution crashes.
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { registrationGuard } from './core/auth/registration.guard';
import { vi } from 'vitest';

// Mocks for referenced components to avoid full compilation during route testing
vi.mock('./login/login.component', () => ({ LoginComponent: class {} }));
vi.mock('./register/register.component', () => ({ RegisterComponent: class {} }));
vi.mock('./home/home.component', () => ({ HomeComponent: class {} }));
vi.mock('./dashboard/dashboard-layout.component', () => ({ DashboardLayoutComponent: class {} }));
vi.mock('./chat/chat-layout.component', () => ({ ChatLayoutComponent: class {} }));
vi.mock('./analytics/analytics.component', () => ({ AnalyticsComponent: class {} }));
vi.mock('./simulation/simulation.routes', () => ({ simulationRoutes: [] }));

// MOCK: @material/material-color-utilities
// Ensures lazy loaded chunks don't fail due to deep imports in ThemeService dependency tree
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

describe('AppRoutes', () => {
  let router: Router;
  let routes: Routes;

  beforeEach(async () => {
    const mod = await import('./app.routes');
    routes = mod.routes;

    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
    router = TestBed.inject(Router);
  });

  it('should explicitly define the login route with Guest Guard', async () => {
    const route = routes.find((r) => r.path === 'login');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);

    // Verify lazy loader
    const component = await route?.loadComponent!();
    expect(component).toBeTruthy();
  });

  it('should explicitly define the register route with Guest and Registration Guards', async () => {
    const route = routes.find((r) => r.path === 'register');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);
    expect(route?.canActivate).toContain(registrationGuard);

    const component = await route?.loadComponent!();
    expect(component).toBeTruthy();
  });

  it('should define the root path as Home with Auth Guard', async () => {
    const route = routes.find((r) => r.path === '');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent!();
    expect(component).toBeTruthy();
  });

  it('should define dashboard details route with ID parameter', async () => {
    const route = routes.find((r) => r.path === 'dashboard/:id');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent!();
    expect(component).toBeTruthy();
  });

  it('should lazy load the simulation feature module', async () => {
    const route = routes.find((r) => r.path === 'simulation');
    expect(route).toBeDefined();
    expect(route?.loadChildren).toBeDefined();

    const childRoutes = await (route?.loadChildren as Function)();
    expect(childRoutes).toBeTruthy();
  });

  it('should define the chat route with Auth Guard', async () => {
    const route = routes.find((r) => r.path === 'chat');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent!();
    expect(component).toBeTruthy();
  });

  it('should define the analytics route with Auth Guard', async () => {
    const route = routes.find((r) => r.path === 'analytics');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent!();
    expect(component).toBeTruthy();
  });

  it('should redirect unknown paths to root', () => {
    const route = routes.find((r) => r.path === '**');
    expect(route).toBeDefined();
    expect(route?.redirectTo).toBe('');
  });
});
