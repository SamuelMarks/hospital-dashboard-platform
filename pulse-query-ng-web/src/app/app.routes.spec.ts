/**
 * @fileoverview Unit tests for Application Routes.
 * Verifies route paths, lazy loading functions, and guard assignments.
 * Includes mocks for material-color-utilities to prevent import resolution crashes.
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter, type Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { registrationGuard } from './core/auth/registration.guard';
import { vi } from 'vitest';

vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

describe('AppRoutes', () => {
  let routes: Routes;

  beforeEach(async () => {
    const mod = await import('./app.routes');
    routes = mod.routes;

    TestBed.configureTestingModule({
      providers: [provideRouter(routes)],
    });
  });

  it('should explicitly define the login route with Guest Guard and LoginComponent', async () => {
    const { LoginComponent } = await import('./login/login.component');
    const route = routes.find((r) => r.path === 'login');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);

    const component = await route?.loadComponent?.();
    expect(component).toBe(LoginComponent);
  });

  it('should explicitly define the register route with Guest and Registration Guards and RegisterComponent', async () => {
    const { RegisterComponent } = await import('./register/register.component');
    const route = routes.find((r) => r.path === 'register');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(guestGuard);
    expect(route?.canActivate).toContain(registrationGuard);

    const component = await route?.loadComponent?.();
    expect(component).toBe(RegisterComponent);
  });

  it('should define the root path as Home with Auth Guard and HomeComponent', async () => {
    const { HomeComponent } = await import('./home/home.component');
    const route = routes.find((r) => r.path === '');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent?.();
    expect(component).toBe(HomeComponent);
  });

  it('should define dashboard details route with ID parameter and DashboardLayoutComponent', async () => {
    const { DashboardLayoutComponent } = await import('./dashboard/dashboard-layout.component');
    const route = routes.find((r) => r.path === 'dashboard/:id');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent?.();
    expect(component).toBe(DashboardLayoutComponent);
  });

  it('should lazy load the optimization feature module routes', async () => {
    const { optimizationRoutes } = await import('./optimization/optimization.routes');
    const route = routes.find((r) => r.path === 'optimization');
    expect(route).toBeDefined();
    expect(route?.loadChildren).toBeDefined();

    const childRoutes: unknown = await route?.loadChildren?.();
    expect(childRoutes).toBe(optimizationRoutes);
  });

  it('should define the chat route with Auth Guard and ChatLayoutComponent', async () => {
    const { ChatLayoutComponent } = await import('./chat/chat-layout.component');
    const route = routes.find((r) => r.path === 'chat');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent?.();
    expect(component).toBe(ChatLayoutComponent);
  });

  it('should define the analytics route with Auth Guard and AnalyticsComponent', async () => {
    const { AnalyticsComponent } = await import('./analytics/analytics.component');
    const route = routes.find((r) => r.path === 'analytics');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);

    const component = await route?.loadComponent?.();
    expect(component).toBe(AnalyticsComponent);
  });

  it('should define the admin/users and analytics/alert-rules routes with exact components', async () => {
    const { UserManagementComponent } = await import('./admin/users/user-management.component');
    const { AlertRulesComponent } = await import('./analytics/alert-rules/alert-rules.component');

    const adminUsersRoute = routes.find((r) => r.path === 'admin/users');
    expect(adminUsersRoute).toBeDefined();
    expect(await adminUsersRoute?.loadComponent?.()).toBe(UserManagementComponent);

    const alertRulesRoute = routes.find((r) => r.path === 'analytics/alert-rules');
    expect(alertRulesRoute).toBeDefined();
    expect(await alertRulesRoute?.loadComponent?.()).toBe(AlertRulesComponent);
  });

  it('should redirect unknown paths to root', () => {
    const route = routes.find((r) => r.path === '**');
    expect(route).toBeDefined();
    expect(route?.redirectTo).toBe('');
  });

  it('should define admin route with AdminComponent', async () => {
    const { AdminComponent } = await import('./admin/admin.component');
    const route = routes.find((r) => r.path === 'admin');
    expect(route).toBeDefined();
    const component = await route?.loadComponent?.();
    expect(component).toBe(AdminComponent);
  });

  it('should define benchmarks route with BenchmarksComponent', async () => {
    const { BenchmarksComponent } = await import('./benchmarks/benchmarks.component');
    const route = routes.find((r) => r.path === 'benchmarks');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);
    const component = await route?.loadComponent?.();
    expect(component).toBe(BenchmarksComponent);
  });
});
