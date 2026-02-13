/**
 * @fileoverview Simulation Controller UI.
 *
 * Provides controls to simulate database workload scenarios (Traffic spikes, errors, latency).
 * Uses local state store for management.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Material
import { MatCardModule } from '@angular/material/card';
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';

import { SimulationStore } from './simulation.store';
import {
  VizChartComponent,
  ChartConfig,
} from '../shared/visualizations/viz-chart/viz-chart.component';
import { TableDataSet } from '../shared/visualizations/viz-table/viz-table.component';

/**
 * Main View for Database Simulation.
 *
 * **Accessibility (a11y):**
 * - `mat-slider` inputs are labeled via `aria-label` attribute on the handle input.
 * - Live status updates use ARIA live regions implicitly via Angular bindings or explicit alerts.
 */
@Component({
  selector: 'app-simulation',
  // 'standalone: true' omitted (default).
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatSliderModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatTooltipModule,
    VizChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SimulationStore], // Component-level Store
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
        grid-template-columns: 350px 1fr;
        gap: 24px;
      }
      .control-panel {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .slider-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 8px;
      }
      .slider-header {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        font-weight: 500;
        color: var(--sys-text-secondary);
      }

      .status-panel {
        background: var(--sys-surface);
        border-radius: 8px;
        padding: 16px;
        border: 1px solid var(--sys-surface-border);
      }
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 16px;
        margin-top: 16px;
      }
      .metric-item {
        text-align: center;
        padding: 12px;
        background: var(--sys-background);
        border-radius: 4px;
      }
      .metric-val {
        font-size: 24px;
        font-weight: 300;
        line-height: 1.2;
      }
      .metric-lbl {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
      }
    `,
  ],
  templateUrl: './simulation.component.html',
})
export class SimulationComponent implements OnInit {
  /** Store. */
  readonly store = inject(SimulationStore);

  /** Params. */
  readonly params = this.store.params;
  /** Metrics. */
  readonly metrics = this.store.metrics;

  /** Chart Config. */
  readonly chartConfig: ChartConfig = {
    xKey: 'time',
    yKey: 'value',
    stackBy: 'type',
  };

  /** Chart Data. */
  readonly chartData = computed<TableDataSet>(() => {
    const history = this.store.history();
    // Flatten History for VizChart
    // Format: [{time: '10:00:01', type: 'Success', value: 50}, {time: '10:00:01', type: 'Error', value: 2}]
    const rows: Record<string, any>[] = [];

    history.forEach((h) => {
      const dateStr = new Date(h.timestamp).toLocaleTimeString();
      rows.push({ time: dateStr, type: 'Success', value: h.rps - h.errors });
      rows.push({ time: dateStr, type: 'Error', value: h.errors });
    });

    return {
      columns: ['time', 'type', 'value'],
      data: rows,
    };
  });

  /** Ng On Init. */
  ngOnInit() {
    // Ensure we start clean
    this.store.reset();
  }

  /** Updates param. */
  updateParam(key: string, value: any) {
    this.store.updateParams({ [key]: value });
  }
}
