/**
 * @fileoverview Consolidated state management store for hospital What-If capacity simulation.
 *
 * Manages demand SQL, unit capacity parameters, hard flow constraints, clinical affinity
 * overrides, and execution results via the generated OpenAPI `SimulationService`.
 */

import { Injectable, signal, inject } from '@angular/core';
import {
  SimulationService as ApiSimulationService,
  ScenarioConstraint,
  ScenarioResult,
  ScenarioRunRequest,
} from '../api-client';
import { extractApiErrorMessage } from '../core/error.utils';
import { TableDataSet } from '../shared/visualizations/viz-table/viz-table.component';

/**
 * Represents a hospital unit and its configured bed capacity for simulation.
 */
export interface UnitCapacity {
  /** Target hospital unit identifier (e.g., `'ICU'`, `'MedSurg'`). */
  unit: string;
  /** Maximum available bed capacity for the unit. */
  capacity: number;
}

/**
 * Represents a single clinical service-to-unit affinity score override entry.
 */
export interface AffinityOverrideEntry {
  /** Clinical service name (e.g., `'Cardiology'`). */
  service: string;
  /** Target hospital unit name (e.g., `'ICU'`). */
  unit: string;
  /** Clinical affinity score between `0.0` and `1.0`. */
  score: number;
}

/**
 * Signal-backed store managing What-If simulation state and solver execution.
 */
@Injectable()
export class SimulationStore {
  /** Generated OpenAPI client for simulation endpoints. */
  private readonly api = inject(ApiSimulationService);

  /** SQL query retrieving baseline service demand and current unit distribution. */
  readonly demandSql = signal<string>(
    'SELECT department as Service, department as Unit, COUNT(*) as Count FROM hospital_data GROUP BY department;',
  );

  /** Editable list of hospital unit bed capacity parameters. */
  readonly capacityParams = signal<UnitCapacity[]>([
    { unit: 'ICU', capacity: 10 },
    { unit: 'MedSurg', capacity: 50 },
    { unit: 'ED', capacity: 20 },
    { unit: 'OR', capacity: 5 },
    { unit: 'NICU', capacity: 15 },
    { unit: 'Nursery', capacity: 30 },
  ]);

  /** Editable list of hard flow constraints (`force_flow`). */
  readonly constraints = signal<ScenarioConstraint[]>([]);

  /** Editable list of clinical service-to-unit affinity score overrides. */
  readonly affinityOverrides = signal<AffinityOverrideEntry[]>([]);

  /** Indicates whether an optimization request is currently in flight. */
  readonly isSimulating = signal<boolean>(false);

  /** Holds the latest user-facing error message if optimization failed. */
  readonly error = signal<string | null>(null);

  /** Formatted tabular optimization results returned by the MPAX solver. */
  readonly results = signal<TableDataSet | null>(null);

  /**
   * Updates the SQL query used to source patient demand.
   *
   * @param sql - DuckDB SQL query string.
   */
  setDemandSql(sql: string): void {
    this.demandSql.set(sql);
  }

  /**
   * Appends a blank unit capacity entry to `capacityParams`.
   */
  addCapacityParam(): void {
    this.capacityParams.update((params) => [...params, { unit: '', capacity: 0 }]);
  }

  /**
   * Updates the unit capacity entry at `index`.
   *
   * @param index - Zero-based index of the capacity entry.
   * @param param - Replacement `UnitCapacity` object.
   */
  updateCapacityParam(index: number, param: UnitCapacity): void {
    this.capacityParams.update((params) => {
      const newParams = [...params];
      newParams[index] = param;
      return newParams;
    });
  }

  /**
   * Removes the unit capacity entry at `index`.
   *
   * @param index - Zero-based index of the capacity entry to remove.
   */
  removeCapacityParam(index: number): void {
    this.capacityParams.update((params) => {
      const newParams = [...params];
      newParams.splice(index, 1);
      return newParams;
    });
  }

  /**
   * Appends a new default `force_flow` constraint rule to `constraints`.
   *
   * @param constraint - Optional initial constraint values.
   */
  addConstraint(
    constraint: ScenarioConstraint = {
      type: 'force_flow',
      service: '',
      unit: '',
      min: 0,
      max: null,
    },
  ): void {
    this.constraints.update((list) => [...list, constraint]);
  }

  /**
   * Updates an existing flow constraint at `index`.
   *
   * @param index - Zero-based index in `constraints`.
   * @param constraint - Updated `ScenarioConstraint` object.
   */
  updateConstraint(index: number, constraint: ScenarioConstraint): void {
    this.constraints.update((list) => {
      const next = [...list];
      next[index] = constraint;
      return next;
    });
  }

  /**
   * Removes the flow constraint at `index`.
   *
   * @param index - Zero-based index in `constraints` to remove.
   */
  removeConstraint(index: number): void {
    this.constraints.update((list) => list.filter((_, idx) => idx !== index));
  }

  /**
   * Appends a clinical affinity override entry to `affinityOverrides`.
   *
   * @param entry - Optional initial affinity override entry.
   */
  addAffinityOverride(entry: AffinityOverrideEntry = { service: '', unit: '', score: 1.0 }): void {
    this.affinityOverrides.update((list) => [...list, entry]);
  }

  /**
   * Updates the affinity override entry at `index`.
   *
   * @param index - Zero-based index in `affinityOverrides`.
   * @param entry - Updated `AffinityOverrideEntry` value.
   */
  updateAffinityOverride(index: number, entry: AffinityOverrideEntry): void {
    this.affinityOverrides.update((list) => {
      const next = [...list];
      next[index] = entry;
      return next;
    });
  }

  /**
   * Removes the affinity override entry at `index`.
   *
   * @param index - Zero-based index in `affinityOverrides` to remove.
   */
  removeAffinityOverride(index: number): void {
    this.affinityOverrides.update((list) => list.filter((_, idx) => idx !== index));
  }

  /**
   * Dispatches the current scenario configuration to the backend MPAX LP solver.
   */
  runSimulation(): void {
    this.isSimulating.set(true);
    this.error.set(null);
    this.results.set(null);

    const capacityMap: Record<string, number> = {};
    this.capacityParams().forEach((p) => {
      const trimmed = p.unit.trim();
      if (trimmed) {
        capacityMap[trimmed] = p.capacity;
      }
    });

    const affinityMap: Record<string, Record<string, number>> = {};
    for (const item of this.affinityOverrides()) {
      const svc = item.service.trim();
      const unit = item.unit.trim();
      if (svc && unit) {
        if (!affinityMap[svc]) {
          affinityMap[svc] = {};
        }
        affinityMap[svc][unit] = item.score;
      }
    }

    const requestPayload: ScenarioRunRequest = {
      demand_source_sql: this.demandSql(),
      capacity_parameters: capacityMap,
      constraints: this.constraints(),
      ...(Object.keys(affinityMap).length > 0 ? { affinity_overrides: affinityMap } : {}),
    };

    this.api.runSimulationApiV1SimulationRunPost(requestPayload).subscribe({
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
      error: (err: unknown) => {
        this.error.set(extractApiErrorMessage(err, $localize`Simulation failed`));
        this.isSimulating.set(false);
      },
    });
  }
}
