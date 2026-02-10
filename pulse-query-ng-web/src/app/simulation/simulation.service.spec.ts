import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { SimulationStore } from './simulation.service';
import { SimulationService as ApiService } from '../api-client/api/simulation.service';

describe('SimulationStore (API-backed)', () => {
  let store: SimulationStore;
  let mockApi: { runSimulationApiV1SimulationRunPost: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockApi = {
      runSimulationApiV1SimulationRunPost: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        SimulationStore,
        { provide: ApiService, useValue: mockApi }
      ]
    });

    store = TestBed.inject(SimulationStore);
  });

  it('updates capacity and constraint state', () => {
    store.updateCapacity('ICU_Gen', 99);
    expect(store.capacityMap()['ICU_Gen']).toBe(99);

    store.addConstraint();
    expect(store.constraints().length).toBe(1);

    store.removeConstraint(0);
    expect(store.constraints().length).toBe(0);
  });

  it('runs scenario and stores results on success', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(
      of({ assignments: [{ Service: 'A', Unit: 'B', Patient_Count: 1 }] })
    );

    store.runScenario();

    expect(store.isRunning()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.results()?.length).toBe(1);
  });

  it('handles scenario errors gracefully', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(
      throwError(() => ({ error: { detail: 'Bad request' }, message: 'Boom' }))
    );

    store.runScenario();

    expect(store.isRunning()).toBe(false);
    expect(store.results()).toBeNull();
    expect(store.error()).toBe('Bad request');
  });

  it('falls back to message when error detail missing', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(
      throwError(() => ({ message: 'Boom' }))
    );

    store.runScenario();

    expect(store.error()).toBe('Boom');
  });
});
