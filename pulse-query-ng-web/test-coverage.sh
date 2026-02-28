#!/bin/bash
cat << 'TEST' >> pulse-query-ng-web/src/app/simulation/simulation.store.spec.ts
  it('should handle simulation error with generic fallback', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(throwError(() => ({})));

    store.runSimulation();

    expect(store.isSimulating()).toBe(false);
    expect(store.error()).toBe('Simulation failed');
  });
TEST
npx vitest run src/app/simulation/simulation.store.spec.ts --coverage.include="src/app/simulation/simulation.store.ts"
