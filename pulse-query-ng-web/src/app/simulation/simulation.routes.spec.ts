/** 
 * @fileoverview Unit tests for Simulation Routes. 
 */ 

import { TestBed } from '@angular/core/testing'; 
import { provideRouter, Router } from '@angular/router'; 
import { simulationRoutes } from './simulation.routes'; 
import { vi } from 'vitest';

// Mock component to prevent actual loading during route test
vi.mock('./simulation.component', () => ({ SimulationComponent: class {} })); 

// MOCK: @material/material-color-utilities
// Prevents import mapping errors causing "Cannot find module" during route checks
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xFFFFFFFF,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true
}));

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