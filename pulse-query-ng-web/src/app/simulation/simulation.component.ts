/* v8 ignore start */
/** @docs */
import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

// Material
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { SimulationStore, UnitCapacity } from './simulation.store';
import { VizTableComponent } from '../shared/visualizations/viz-table/viz-table.component';

/** @docs */
@Component({
  selector: 'app-simulation',
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    VizTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
/** @docs */
export class SimulationComponent implements OnInit {
  readonly store = inject(SimulationStore);
  private readonly route = inject(ActivatedRoute);

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      if (params['sql']) {
        this.store.setDemandSql(params['sql']);
      }
    });
  }

  updateDemandSql(sql: string) {
    this.store.setDemandSql(sql);
  }

  addCapacity() {
    this.store.addCapacityParam();
  }

  updateCapacity(index: number, field: 'unit' | 'capacity', value: any) {
    const current = this.store.capacityParams()[index];
    this.store.updateCapacityParam(index, { ...current, [field]: value });
  }

  removeCapacity(index: number) {
    this.store.removeCapacityParam(index);
  }
}
