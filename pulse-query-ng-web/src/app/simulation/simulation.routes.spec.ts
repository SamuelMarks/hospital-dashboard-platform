/**
 * @fileoverview Unit tests for Simulation Routes.
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { simulationRoutes } from './simulation.routes';
import { vi } from 'vitest';

// Mock component to prevent actual loading during route test

// MOCK: @material/material-color-utilities
// Prevents import mapping errors causing "Cannot find module" during route checks
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

describe('SimulationRoutes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(simulationRoutes)],
    });
  });

  it('should define the default route with SimulationComponent', async () => {
    const { SimulationComponent } = await import('./simulation.component');
    const route = simulationRoutes.find((r) => r.path === '');
    expect(route).toBeDefined();

    // Check lazy loading function resolves to exact SimulationComponent class
    const component = await route?.loadComponent?.();
    expect(component).toBe(SimulationComponent);
  });
});
