/**
 * @fileoverview Unit tests for `SimulationStore`.
 */

import { TestBed } from '@angular/core/testing';
import { SimulationStore } from './simulation.store';
import { ScenarioResult, SimulationService } from '../api-client';
import { of, throwError } from 'rxjs';
import { vi, type Mock } from 'vitest';

describe('SimulationStore', () => {
  let store: SimulationStore;
  let mockApi: { runSimulationApiV1SimulationRunPost: Mock };

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
    expect(store.constraints()).toEqual([]);
    expect(store.affinityOverrides()).toEqual([]);
  });

  it('should update demand sql', () => {
    store.setDemandSql('SELECT 1');
    expect(store.demandSql()).toBe('SELECT 1');
  });

  it('should add, update, and remove capacity params', () => {
    const initialLength = store.capacityParams().length;
    store.addCapacityParam();
    expect(store.capacityParams().length).toBe(initialLength + 1);
    expect(store.capacityParams()[initialLength]).toEqual({ unit: '', capacity: 0 });

    store.updateCapacityParam(0, { unit: 'TestUnit', capacity: 99 });
    expect(store.capacityParams()[0]).toEqual({ unit: 'TestUnit', capacity: 99 });

    store.removeCapacityParam(0);
    expect(store.capacityParams().length).toBe(initialLength);
  });

  it('should add, update, and remove constraints', () => {
    store.addConstraint();
    expect(store.constraints().length).toBe(1);
    expect(store.constraints()[0]?.type).toBe('force_flow');

    store.updateConstraint(0, {
      type: 'force_flow',
      service: 'Cardiology',
      unit: 'ICU',
      min: 3,
      max: 8,
    });
    expect(store.constraints()[0]).toEqual({
      type: 'force_flow',
      service: 'Cardiology',
      unit: 'ICU',
      min: 3,
      max: 8,
    });

    store.removeConstraint(0);
    expect(store.constraints()).toEqual([]);
  });

  it('should add, update, and remove affinity overrides', () => {
    store.addAffinityOverride();
    expect(store.affinityOverrides().length).toBe(1);

    store.updateAffinityOverride(0, { service: 'Cardiology', unit: 'ICU', score: 0.95 });
    expect(store.affinityOverrides()[0]).toEqual({
      service: 'Cardiology',
      unit: 'ICU',
      score: 0.95,
    });

    store.removeAffinityOverride(0);
    expect(store.affinityOverrides()).toEqual([]);
  });

  it('should run simulation successfully with constraints and affinity overrides', () => {
    const mockResult: ScenarioResult = {
      status: 'Optimal',
      assignments: [
        { Service: 'Cardiology', Unit: 'ICU', Original_Count: 10, Patient_Count: 12, Delta: 2 },
      ],
    };
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(of(mockResult));

    store.setDemandSql('SELECT mock');
    store.updateCapacityParam(0, { unit: 'ICU', capacity: 20 });
    store.updateCapacityParam(1, { unit: '  ', capacity: 0 });
    store.addConstraint({ type: 'force_flow', service: 'Cardiology', unit: 'ICU', min: 5 });
    store.addAffinityOverride({ service: 'Cardiology', unit: 'ICU', score: 0.9 });
    store.addAffinityOverride({ service: 'Cardiology', unit: 'MedSurg', score: 0.4 });
    store.addAffinityOverride({ service: '  ', unit: 'ICU', score: 0.5 });

    store.runSimulation();

    expect(store.isSimulating()).toBe(false);
    expect(store.error()).toBeNull();

    const results = store.results();
    expect(results).toBeTruthy();
    expect(results?.columns).toEqual([
      'Service',
      'Unit',
      'Original_Count',
      'Patient_Count',
      'Delta',
    ]);
    expect(results?.data.length).toBe(1);
    expect(results?.data[0]?.['Service']).toBe('Cardiology');
    expect(results?.data[0]?.['Delta']).toBe(2);

    expect(mockApi.runSimulationApiV1SimulationRunPost).toHaveBeenCalledWith({
      demand_source_sql: 'SELECT mock',
      capacity_parameters: expect.objectContaining({ ICU: 20 }) as unknown,
      constraints: [{ type: 'force_flow', service: 'Cardiology', unit: 'ICU', min: 5 }],
      affinity_overrides: {
        Cardiology: { ICU: 0.9, MedSurg: 0.4 },
      },
    });
  });

  it('should omit affinity_overrides when none are configured', () => {
    const mockResult: ScenarioResult = { status: 'Optimal', assignments: [] };
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(of(mockResult));

    store.runSimulation();

    expect(mockApi.runSimulationApiV1SimulationRunPost).toHaveBeenCalledWith({
      demand_source_sql: store.demandSql(),
      capacity_parameters: expect.any(Object) as unknown,
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

  it('should handle simulation error with defined error object but missing detail', () => {
    mockApi.runSimulationApiV1SimulationRunPost.mockReturnValue(throwError(() => ({ error: {} })));
    store.runSimulation();
    expect(store.error()).toBe('Simulation failed');
  });
});
