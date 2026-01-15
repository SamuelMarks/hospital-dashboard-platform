/**
 * @fileoverview State Management for Simulation Logic.
 * 
 * Handles:
 * - Simulation Parameters (Inputs).
 * - Real-time Metrics (Outputs).
 * - Ticker/Timer logic for synthetic data generation.
 */

import { Injectable, signal, computed, effect, OnDestroy } from '@angular/core'; 

export interface SimParams { 
  users: number; 
  rate: number; 
  errorInjection: boolean; 
  failureRate: number; 
  latencyInjection: boolean; 
} 

export interface SimMetrics { 
  activeConnections: number; 
  rps: number; 
  errorCount: number; 
  avgLatency: number; 
} 

export interface HistoryPoint { 
  timestamp: number; 
  rps: number; 
  errors: number; 
} 

@Injectable() 
export class SimulationStore implements OnDestroy { 
  // State Signals
  readonly isActive = signal(false); 
  
  readonly params = signal<SimParams>({ 
    users: 50, 
    rate: 100, 
    errorInjection: false, 
    failureRate: 5, 
    latencyInjection: false 
  }); 

  readonly metrics = signal<SimMetrics>({ 
    activeConnections: 0, 
    rps: 0, 
    errorCount: 0, 
    avgLatency: 0 
  }); 

  readonly history = signal<HistoryPoint[]>([]); 

  private timer: any = null; 

  constructor() { 
    // Effect to start/stop engine based on active state
    effect(() => { 
      if (this.isActive()) { 
        this.startEngine(); 
      } else { 
        this.stopEngine(); 
      } 
    }); 
  } 

  ngOnDestroy(): void { 
    this.stopEngine(); 
  } 

  toggleSimulation() { 
    this.isActive.update(v => !v); 
  } 

  updateParams(partial: Partial<SimParams>) { 
    this.params.update(current => ({ ...current, ...partial })); 
  } 

  reset() { 
    this.isActive.set(false); 
    this.metrics.set({ activeConnections: 0, rps: 0, errorCount: 0, avgLatency: 0 }); 
    this.history.set([]); 
  } 

  private startEngine() { 
    if (this.timer) return; 

    // Simulation Tick (1s)
    this.timer = setInterval(() => { 
       this.tick(); 
    }, 1000); 
  } 

  private stopEngine() { 
    if (this.timer) { 
      clearInterval(this.timer); 
      this.timer = null; 
    } 
  } 

  /**
   * Generates synthetic metrics based on current parameters.
   * "Fake Logic" to mimic backend fluctuation.
   */
  private tick() { 
    const p = this.params(); 
    
    // Variance factor (+/- 10%)
    const variance = (Math.random() * 0.2) + 0.9; 
    
    // Calculate RPS
    const currentRps = Math.floor(p.rate * variance); 
    
    // Errors
    let errors = 0; 
    if (p.errorInjection) { 
      const failRate = p.failureRate / 100; 
      // Binomial approx
      errors = Math.floor(currentRps * failRate); 
    } 

    // Latency 
    let latency = 20 + (Math.random() * 10); // Base 20-30ms 
    if (p.latencyInjection) { 
      latency += (Math.random() * 500) + 100; // Spike 
    } 
    // Latency increases slightly with load
    latency += (p.users * 0.1); 

    // Update Metrics
    this.metrics.update(m => ({ 
      activeConnections: p.users, 
      rps: currentRps, 
      errorCount: m.errorCount + errors, 
      avgLatency: latency 
    })); 

    // Update History (Keep last 60 points)
    this.history.update(h => { 
      const pt = { timestamp: Date.now(), rps: currentRps, errors }; 
      const next = [...h, pt]; 
      return next.slice(-60); 
    }); 
  } 
}