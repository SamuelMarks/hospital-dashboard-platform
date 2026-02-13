import { Component, inject, computed, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Material Imports
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';

// Core & Visualizations
import { SimulationStore } from '../simulation.store';
// Note: SimulationStore is provided at the module level or root unless specified
// Assuming it is provided in root based on previous context
import { SimulationStore as SimServiceInstance } from '../simulation.service';

import {
  VizTableComponent,
  TableDataSet,
} from '../../shared/visualizations/viz-table/viz-table.component';
import { VizChartComponent } from '../../shared/visualizations/viz-chart/viz-chart.component';
import { ScenarioConstraint } from '../../api-client';

/** Scenario Editor component. */
@Component({
  selector: 'app-scenario-editor',
  imports: [
    CommonModule,
    FormsModule,
    MatSliderModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatExpansionModule,
    MatListModule,
    MatDividerModule,
    MatChipsModule,
    VizTableComponent,
    VizChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-editor.component.html',
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        overflow: hidden;
      }
      .scenario-layout {
        display: flex;
        height: 100%;
      }

      /* Left Configuration Pane */
      .config-pane {
        width: 360px;
        background: var(--sys-surface);
        border-right: 1px solid var(--sys-surface-border);
        display: flex;
        flex-direction: column;
        z-index: 2;
      }
      .pane-header {
        padding: 24px;
        border-bottom: 1px solid var(--sys-surface-border);
      }
      .pane-content {
        flex: 1;
        overflow-y: auto;
      }
      .action-footer {
        padding: 16px;
        border-top: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface);
      }

      /* Sliders & Inputs */
      .capacity-list {
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding: 8px 0;
      }
      .capacity-row {
        display: flex;
        flex-direction: column;
      }
      .row-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: -8px;
      }
      .unit-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--sys-text-primary);
      }
      .compact-chip {
        transform: scale(0.8);
        transform-origin: right center;
        --mdc-chip-label-text-color: var(--sys-primary);
      }

      /* Constraints List */
      .constraint-item {
        height: auto !important;
        align-items: flex-start;
        padding-top: 12px;
      }
      .empty-list-msg {
        text-align: center;
        color: var(--sys-text-secondary);
        font-style: italic;
        padding: 16px;
        font-size: 12px;
      }

      /* Right Results Pane */
      .results-pane {
        flex: 1;
        background-color: var(--sys-background);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .results-header {
        padding: 24px 32px;
        background-color: var(--sys-background);
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .results-content {
        flex: 1;
        overflow-y: auto;
        padding: 0 32px 32px 32px;
      }

      /* Viz Layout */
      .dashboard-grid-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        padding-bottom: 40px;
      }
      .viz-card {
        background-color: var(--sys-surface);
        border-radius: 12px;
        border: 1px solid var(--sys-surface-border);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 320px;
      }
      .full-width {
        grid-column: 1 / -1;
        min-height: 400px;
      }
      .viz-header {
        padding: 12px 16px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
        background-color: var(--sys-background);
        border-bottom: 1px solid var(--sys-surface-border);
      }
      .viz-body {
        flex: 1;
        position: relative;
        padding: 16px;
      }
      .table-wrapper {
        padding: 0;
      }

      .empty-state {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
})
export class ScenarioEditorComponent {
  // Inject the singleton store service
  /** Store. */
  readonly store = inject(SimServiceInstance);

  /** Units. */
  readonly units = computed(() => Object.keys(this.store.capacityMap()));

  // Access store's mutable constraint list signal
  /** Constraints. */
  readonly constraints = this.store.constraints;

  // --- Computed Projections ---

  /** Formats result list into Table Data structure. */
  readonly tableData = computed<TableDataSet | null>(() => {
    const res = this.store.results();
    if (!res) return null;

    // Sort by largest delta impact
    const sorted = [...res].sort((a, b) => Math.abs(b.Delta ?? 0) - Math.abs(a.Delta ?? 0));

    const rows = sorted.map((a) => ({
      Service: a.Service,
      Unit: a.Unit,
      Allocated: a.Patient_Count,
      Original: a.Original_Count,
      Delta: a.Delta,
    }));
    return { columns: ['Service', 'Unit', 'Allocated', 'Original', 'Delta'], data: rows };
  });

  /** Allocation Chart Data. */
  readonly allocationData = computed<TableDataSet | null>(() => {
    const res = this.store.results();
    if (!res) return null;
    const rows = res.map((a) => ({ Unit: a.Unit, Service: a.Service, Patients: a.Patient_Count }));
    return { columns: ['Unit', 'Service', 'Patients'], data: rows };
  });

  /** Deviation Chart Data. */
  readonly deviationData = computed<TableDataSet | null>(() => {
    const res = this.store.results();
    if (!res) return null;
    const rows = res
      .filter((a) => Math.abs(a.Delta ?? 0) > 0.1)
      .map((a) => ({ Unit: a.Unit, Service: a.Service, Delta: a.Delta }));
    return { columns: ['Unit', 'Service', 'Delta'], data: rows };
  });

  /** KPI: Total Allocated Patients. */
  readonly totalAllocated = computed(() => {
    const res = this.store.results();
    // Fix string/number arithmetic safety
    return res
      ? res.reduce((acc, curr) => acc + (Number(curr.Patient_Count) || 0), 0).toFixed(0)
      : '0';
  });

  // --- Actions ---

  /** Gets capacity. */
  getCapacity(unit: string): number {
    return this.store.capacityMap()[unit];
  }

  /** Sets capacity. */
  setCapacity(unit: string, val: number): void {
    this.store.updateCapacity(unit, val);
  }

  /** Adds constraint. */
  addConstraint() {
    this.store.addConstraint();
  }

  /** Removes constraint. */
  removeConstraint(index: number) {
    this.store.removeConstraint(index);
  }
}
