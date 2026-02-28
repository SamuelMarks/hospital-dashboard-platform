import { TestBed } from '@angular/core/testing';
import { SimulationStore } from './simulation.store';
import { SimulationService } from '../api-client';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

describe('SimulationStore', () => {
  let store: SimulationStore;
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      runSimulationApiV1SimulationRunPost: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [SimulationStore, { provide: SimulationService, useValue: mockApi }],
    });
    store = TestBed.inject(SimulationStore);
  });

  it('should initialize with defaults', () => {
    expect(store.isSimulating()).toBe(false);
    expect(store.capacityParams().length).toBeGreaterThan(0);
    expect(store.demandSql()).toContain('SELECT');
  });

  it('should update demand sql', () => {
    store.setDemandSql('SELECT 1');
    expect(store.demandSql()).toBe('SELECT 1');
  });

  it('should add capacity param', () => {
    const initialLength = store.capacityParams().length;
    store.addCapacityParam();
    expect(store.capacityParams().length).toBe(initialLength + 1);
    expect(store.capacityParams()[initialLength]).toEqual({ unit: '', capacity: 0 });
  });

  it('should update capacity param', () => {
    store.updateCapacityParam(0, { unit: 'TestUnit', capacity: 99 });
    expect(store.capacityParams()[0]).toEqual({ unit: 'TestUnit', capacity: 99 });
  });

  it('should remove capacity param', () => {
    const initialLength = store.capacityParams().length;
    store.removeCapacityParam(0);
    expect(store.capacityParams().length).toBe(initialLength - 1);
  });

  it('should run simulation successfully', () => {
    const mockResult = {
      status: 'success',
      assignments: [
        { Service: 'Cardiology', Unit: 'ICU', Original_Count: 10, Patient_Count: 12, Delta: 2 },
      ],
    };
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(of(mockResult));

    store.setDemandSql('SELECT mock');
    store.updateCapacityParam(0, { unit: 'ICU', capacity: 20 });
    // empty unit should be ignored
    store.updateCapacityParam(1, { unit: '  ', capacity: 0 });

    store.runSimulation();

    expect(store.isSimulating()).toBe(false);
    expect(store.error()).toBeNull();

    const results = store.results();
    expect(results).toBeTruthy();
    expect(results!.columns).toEqual([
      'Service',
      'Unit',
      'Original_Count',
      'Patient_Count',
      'Delta',
    ]);
    expect(results!.data.length).toBe(1);
    expect(results!.data[0]['Service']).toBe('Cardiology');
    expect(results!.data[0]['Delta']).toBe(2);

    expect(mockApi.runSimulationApiV1SimulationRunPost).toHaveBeenCalledWith({
      demand_source_sql: 'SELECT mock',
      capacity_parameters: expect.objectContaining({ ICU: 20 }),
      constraints: [],
    });
  });

  it('should handle simulation error with detail', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(
      throwError(() => ({
        error: { detail: 'Custom backend error' },
      })),
    );

    store.runSimulation();

    expect(store.isSimulating()).toBe(false);
    expect(store.error()).toBe('Custom backend error');
    expect(store.results()).toBeNull();
  });

  it('should handle simulation error with message fallback', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(
      throwError(() => new Error('Network error')),
    );

    store.runSimulation();

    expect(store.isSimulating()).toBe(false);
    expect(store.error()).toBe('Network error');
  });

  it('should handle simulation error with generic fallback', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(throwError(() => ({})));

    store.runSimulation();

    expect(store.isSimulating()).toBe(false);
    expect(store.error()).toBe('Simulation failed');
  });
});
