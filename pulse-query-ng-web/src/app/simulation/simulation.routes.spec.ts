/**
 * @fileoverview Unit tests for Simulation Routes.
 */

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { simulationRoutes } from './simulation.routes';

// Mock component to prevent actual loading during route test
vi.mock('./simulation.component', () => ({ SimulationComponent: class {} }));

describe('SimulationRoutes', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(simulationRoutes)]
    });
    router = TestBed.inject(Router);
  });

  it('should define the default route', async () => {
    const route = simulationRoutes.find(r => r.path === '');
    expect(route).toBeDefined();
    
    // Check lazy loading function
    const component = await route?.loadComponent!();
    expect(component).toBeTruthy();
  });
});