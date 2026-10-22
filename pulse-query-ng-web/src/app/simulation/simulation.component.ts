/**
 * @fileoverview Hospital What-If Simulation component for configuring patient demand SQL,
 * unit capacities, hard flow constraints, and clinical affinity overrides.
 */

import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SimulationStore } from './simulation.store';
import { extractEventInputValue } from '../shared/utils/dom-event.utils';
import { VizTableComponent } from '../shared/visualizations/viz-table/viz-table.component';

/**
 * Component providing an interactive What-If capacity simulation workspace.
 */
@Component({
  selector: 'app-simulation',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    VizTableComponent,
  ],
  providers: [SimulationStore],
  styles: [
    `
      :host {
        display: block;
        padding: 24px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .grid-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
      }
      .panel {
        background: var(--sys-surface);
        border-radius: 8px;
        padding: 16px;
        border: 1px solid var(--sys-surface-border);
      }
      .capacity-row {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 8px;
      }
      .capacity-row mat-form-field {
        flex: 1;
      }
      .results-panel {
        margin-top: 24px;
      }
      .sql-input {
        font-family: monospace;
        min-height: 150px;
      }
      .error-box {
        padding: 16px;
        background-color: var(--sys-error-container);
        color: var(--sys-on-error-container);
        border-left: 4px solid var(--sys-error);
        border-radius: 4px;
        margin-bottom: 16px;
      }
    `,
  ],
  templateUrl: './simulation.component.html',
})
export class SimulationComponent implements OnInit {
  /** Injected simulation state store. */
  readonly store = inject(SimulationStore);

  /** Current activated route used to inspect initial `sql` query parameters. */
  private readonly route = inject(ActivatedRoute);
  /** DestroyRef for cleaning up route query parameter subscriptions. */
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Extracts the string value from a DOM `input` or `textarea` event target.
   *
   * @param event - DOM input event.
   * @returns String value of the input element.
   */
  getEventValue(event: Event): string {
    return extractEventInputValue(event);
  }

  /**
   * Initializes demand SQL from the URL `sql` query parameter if provided.
   */
  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const sqlParam: unknown = params['sql'];
      if (typeof sqlParam === 'string' && sqlParam) {
        this.store.setDemandSql(sqlParam);
      }
    });
  }

  /**
   * Forwards updated demand SQL text to `SimulationStore`.
   *
   * @param sql - Updated SQL query string.
   */
  updateDemandSql(sql: string): void {
    this.store.setDemandSql(sql);
  }

  /**
   * Appends a new unit capacity row to the simulation store.
   */
  addCapacity(): void {
    this.store.addCapacityParam();
  }

  /**
   * Updates either the `unit` name or numeric `capacity` of a capacity row.
   *
   * @param index - Zero-based row index.
   * @param field - Field to modify (`'unit'` or `'capacity'`).
   * @param value - New field value.
   */
  updateCapacity(index: number, field: 'unit' | 'capacity', value: string | number): void {
    const current = this.store.capacityParams()[index];
    if (current) {
      this.store.updateCapacityParam(index, { ...current, [field]: value });
    }
  }

  /**
   * Removes the unit capacity row at `index`.
   *
   * @param index - Zero-based row index to remove.
   */
  removeCapacity(index: number): void {
    this.store.removeCapacityParam(index);
  }
}
