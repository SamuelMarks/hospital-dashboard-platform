import { Injectable, signal, computed, inject } from '@angular/core';
import { finalize } from 'rxjs';
import { SimulationService as ApiService } from '../api-client/api/simulation.service';
import { ScenarioRunRequest, ScenarioConstraint } from '../api-client/model/models';
import { SimulationAssignment } from '../api-client/model/models'; // Fix import source

/**
 * Frontend State Management for Simulation.
 */
@Injectable({ providedIn: 'root' })
export class SimulationStore {
  private readonly api = inject(ApiService);

  // --- State ---
  readonly capacityMap = signal<Record<string, number>>({
    'PCU_A': 20,
    'PCU_B': 20,
    'ICU_Gen': 15,
    'Nursery': 10
  });
  readonly demandSql = signal<string>("SELECT Clinical_Service, count(*) as cnt FROM synthetic_hospital_data WHERE Midnight_Census_DateTime = (SELECT MAX(Midnight_Census_DateTime) FROM synthetic_hospital_data) GROUP BY 1");

  // NEW: Constraints State
  readonly constraints = signal<ScenarioConstraint[]>([]);

  readonly isRunning = signal(false);
  readonly results = signal<SimulationAssignment[] | null>(null);
  readonly error = signal<string | null>(null);

  // --- Actions ---

  updateCapacity(unit: string, count: number) {
    this.capacityMap.update(map => ({ ...map, [unit]: count }));
  }

  addConstraint() {
    this.constraints.update(c => [...c, { type: 'force_flow', service: '', unit: '', min: 0 }]);
  }

  removeConstraint(index: number) {
    this.constraints.update(c => c.filter((_, i) => i !== index));
  }

  runScenario() {
    this.isRunning.set(true);
    this.error.set(null);
    this.results.set(null);

    const req: ScenarioRunRequest = {
      demand_source_sql: this.demandSql(),
      capacity_parameters: this.capacityMap(),
      constraints: this.constraints() // Send populated constraints
    };

    this.api.runSimulationApiV1SimulationRunPost(req)
      .pipe(finalize(() => this.isRunning.set(false)))
      .subscribe({
        next: (res) => this.results.set(res.assignments),
        error: (err) => this.error.set(err.error?.detail || err.message)
      });
  }
}