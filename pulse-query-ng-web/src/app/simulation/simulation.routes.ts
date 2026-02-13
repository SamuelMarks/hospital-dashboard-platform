/**
 * @fileoverview Routing definition for the Simulation Feature Module.
 * Loaded lazily by the main Application router.
 */

import { Routes } from '@angular/router';

/**
 * Routes array for the Simulation feature.
 *
 * Defines:
 * - Default path (`''`): Loads the `SimulationComponent`.
 */
export const simulationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./simulation.component').then((m) => m.SimulationComponent),
    title: 'Workload Simulation - Pulse Query',
  },
];
