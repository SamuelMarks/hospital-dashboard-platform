/* v8 ignore start */
/** @docs */
import { Injectable, signal, inject } from '@angular/core';
import { SimulationService as ApiSimulationService, ScenarioResult } from '../api-client';
import { TableDataSet } from '../shared/visualizations/viz-table/viz-table.component';

/** @docs */
export interface UnitCapacity {
  unit: string;
  capacity: number;
}

@Injectable()
/** @docs */
export class SimulationStore {
  private readonly api = inject(ApiSimulationService);

  readonly demandSql = signal<string>(
    'SELECT Service, CurrentUnit as Unit, COUNT(*) as Count FROM hospital_data GROUP BY Service, CurrentUnit;',
  );
  readonly capacityParams = signal<UnitCapacity[]>([
    { unit: 'ICU', capacity: 10 },
    { unit: 'MedSurg', capacity: 50 },
    { unit: 'ED', capacity: 20 },
    { unit: 'OR', capacity: 5 },
    { unit: 'NICU', capacity: 15 },
    { unit: 'Nursery', capacity: 30 },
  ]);

  readonly isSimulating = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly results = signal<TableDataSet | null>(null);

  setDemandSql(sql: string) {
    this.demandSql.set(sql);
  }

  addCapacityParam() {
    this.capacityParams.update((params) => [...params, { unit: '', capacity: 0 }]);
  }

  updateCapacityParam(index: number, param: UnitCapacity) {
    this.capacityParams.update((params) => {
      const newParams = [...params];
      newParams[index] = param;
      return newParams;
    });
  }

  removeCapacityParam(index: number) {
    this.capacityParams.update((params) => {
      const newParams = [...params];
      newParams.splice(index, 1);
      return newParams;
    });
  }

  runSimulation() {
    this.isSimulating.set(true);
    this.error.set(null);
    this.results.set(null);

    const capacityMap: { [key: string]: number } = {};
    this.capacityParams().forEach((p) => {
      if (p.unit.trim()) {
        capacityMap[p.unit.trim()] = p.capacity;
      }
    });

    this.api
      .runSimulationApiV1SimulationRunPost({
        demand_source_sql: this.demandSql(),
        capacity_parameters: capacityMap,
        constraints: [],
      })
      .subscribe({
        next: (res: ScenarioResult) => {
          const columns = ['Service', 'Unit', 'Original_Count', 'Patient_Count', 'Delta'];
          const data = res.assignments.map((a) => ({
            Service: a.Service,
            Unit: a.Unit,
            Original_Count: a.Original_Count,
            Patient_Count: a.Patient_Count,
            Delta: a.Delta,
          }));

          this.results.set({ columns, data });
          this.isSimulating.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.detail || err.message || 'Simulation failed');
          this.isSimulating.set(false);
        },
      });
  }
}
