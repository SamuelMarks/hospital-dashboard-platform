/**
 * @fileoverview Lazy-loaded route configuration for the Hospital Operations Optimization feature module.
 */

import { Routes } from '@angular/router';

/**
 * Child routes for the `/optimization` feature area.
 */
export const optimizationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./optimization.component').then((m) => m.OptimizationComponent),
  },
];
