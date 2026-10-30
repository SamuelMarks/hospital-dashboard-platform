/**
 * @fileoverview Unit tests for `optimizationRoutes`.
 */

import { optimizationRoutes } from './optimization.routes';
import { OptimizationComponent } from './optimization.component';

describe('optimizationRoutes', () => {
  it('should define the root path lazy-loading OptimizationComponent', async () => {
    expect(optimizationRoutes.length).toBe(1);
    const rootRoute = optimizationRoutes[0];
    expect(rootRoute.path).toBe('');
    const loadedComponent = await rootRoute.loadComponent?.();
    expect(loadedComponent).toBe(OptimizationComponent);
  });
});
