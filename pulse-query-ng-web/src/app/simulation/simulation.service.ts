import { Injectable, signal, computed, inject } from '@angular/core'; 
import { finalize } from 'rxjs'; 
import { SimulationService as ApiService } from '../api-client/api/simulation.service'; 
import { ScenarioRunRequest } from '../api-client/model/scenario-run-request'; 
import { SimulationAssignment } from '../api-client/model/scenario-result'; 

/** 
 * Frontend State Management for Simulation. 
 * Stores the Draft Config (Capacity overrides) and Results. 
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
  
  readonly isRunning = signal(false); 
  readonly results = signal<SimulationAssignment[] | null>(null); 
  readonly error = signal<string | null>(null); 

  // --- Actions --- 

  updateCapacity(unit: string, count: number) { 
    this.capacityMap.update(map => ({ ...map, [unit]: count })); 
  } 

  runScenario() { 
    this.isRunning.set(true); 
    this.error.set(null); 
    this.results.set(null); 

    const req: ScenarioRunRequest = { 
      demand_source_sql: this.demandSql(), 
      capacity_parameters: this.capacityMap(), 
      constraints: [] 
    }; 

    this.api.runSimulationApiV1SimulationRunPost(req) 
      .pipe(finalize(() => this.isRunning.set(false))) 
      .subscribe({ 
        next: (res) => this.results.set(res.assignments), 
        error: (err) => this.error.set(err.error?.detail || err.message) 
      }); 
  } 
}