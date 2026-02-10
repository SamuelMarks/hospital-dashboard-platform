/**
 * @fileoverview Unit tests for SimulationStore.
 */

import { TestBed } from '@angular/core/testing';
import { SimulationStore } from './simulation.store';

describe('SimulationStore', () => {
  let store: SimulationStore;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [SimulationStore]
    });
    store = TestBed.inject(SimulationStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with defaults', () => {
    expect(store.isActive()).toBe(false);
    expect(store.params().users).toBe(50);
  });

  it('should toggle active state', () => {
    store.toggleSimulation();
    expect(store.isActive()).toBe(true);
    store.toggleSimulation();
    expect(store.isActive()).toBe(false);
  });

  it('should update params', () => {
    store.updateParams({ users: 999 });
    expect(store.params().users).toBe(999);
  });

  it('should generate metrics on tick when active', () => {
    store.toggleSimulation();
    
    // Simulate time passing for setInterval
    vi.advanceTimersByTime(1100); 
    
    const m = store.metrics();
    // Default active connections matches users param
    expect(m.activeConnections).toBe(50);
    expect(m.rps).toBeGreaterThan(0);
    
    // History should have accumulated points
    expect(store.history().length).toBeGreaterThan(0);
    
    store.reset(); // Should stop timer
  });

  it('should calculate failure scenarios', () => {
    store.updateParams({ errorInjection: true, failureRate: 100, rate: 100 });
    store.toggleSimulation();
    
    vi.advanceTimersByTime(1100);

    const m = store.metrics();
    // with 100% failure rate, error count should roughly match rps
    expect(m.errorCount).toBeGreaterThan(0);
  });

  it('should apply latency injection when enabled', () => {
    store.updateParams({ latencyInjection: true });
    store.toggleSimulation();

    vi.advanceTimersByTime(1100);
    const m = store.metrics();
    expect(m.avgLatency).toBeGreaterThan(20);
  });

  it('should reset state', () => {
    store.updateParams({ users: 200 });
    store.toggleSimulation();
    store.reset();

    expect(store.isActive()).toBe(false);
    expect(store.history().length).toBe(0);
  });

  it('should stop timers on destroy', () => {
    store.toggleSimulation();
    store.ngOnDestroy();
    expect((store as any).timer).toBeNull();
  });

  it('should avoid starting engine twice', () => {
    (store as any).startEngine();
    const firstTimer = (store as any).timer;
    (store as any).startEngine();
    expect((store as any).timer).toBe(firstTimer);
    (store as any).stopEngine();
  });
});
