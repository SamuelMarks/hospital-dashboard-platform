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
import { VizChartComponent, ChartConfig } from '../shared/visualizations/viz-chart/viz-chart.component'; 
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
    VizChartComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  providers: [SimulationStore], // Component-level Store
  styles: [`
    :host { display: block; padding: 24px; max-width: 1200px; margin: 0 auto; } 
    .grid-layout { display: grid; grid-template-columns: 350px 1fr; gap: 24px; } 
    .control-panel { display: flex; flex-direction: column; gap: 24px; } 
    .slider-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; } 
    .slider-header { display: flex; justify-content: space-between; font-size: 14px; font-weight: 500; color: var(--sys-text-secondary); } 
    
    .status-panel { background: var(--sys-surface); border-radius: 8px; padding: 16px; border: 1px solid var(--sys-surface-border); } 
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-top: 16px; } 
    .metric-item { text-align: center; padding: 12px; background: var(--sys-background); border-radius: 4px; } 
    .metric-val { font-size: 24px; font-weight: 300; line-height: 1.2; } 
    .metric-lbl { font-size: 11px; text-transform: uppercase; color: var(--sys-text-secondary); } 
  `], 
  template: `
    <div class="mb-6 flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-light mb-1">Workload Simulation</h1>
        <p class="text-gray-500">Generate synthetic traffic patterns to test dashboard responsiveness.</p>
      </div>
      
      <div class="flex gap-2">
        <button mat-flat-button color="primary" (click)="store.toggleSimulation()">
          <mat-icon>{{ store.isActive() ? 'stop' : 'play_arrow' }}</mat-icon>
          {{ store.isActive() ? 'Stop Simulation' : 'Start Simulation' }}
        </button>
      </div>
    </div>

    <div class="grid-layout">
      <!-- Left: Controls -->
      <mat-card class="control-panel p-6">
        <h3 class="font-medium text-lg mb-4">Parameters</h3>
        
        <!-- Concurrent Users Slider -->
        <div class="slider-group">
          <div class="slider-header">
            <span>Concurrent Users</span>
            <span class="font-bold text-primary">{{ params().users }}</span>
          </div>
          <!-- A11y: Labeled Slider -->
          <mat-slider min="0" max="1000" step="10" discrete>
            <input matSliderThumb 
                   [ngModel]="params().users" 
                   (ngModelChange)="updateParam('users', $event)"
                   aria-label="Concurrent Users Slider"
            >
          </mat-slider>
        </div>

        <!-- Request Rate Slider -->
        <div class="slider-group">
          <div class="slider-header">
            <span>Request Rate (req/sec)</span>
            <span class="font-bold text-primary">{{ params().rate }}</span>
          </div>
          <mat-slider min="1" max="500" step="5" discrete>
            <input matSliderThumb 
                   [ngModel]="params().rate" 
                   (ngModelChange)="updateParam('rate', $event)"
                   aria-label="Request Rate Slider"
            >
          </mat-slider>
        </div>

        <mat-divider></mat-divider>

        <!-- Error Injection Toggle -->
        <div class="flex justify-between items-center py-2">
          <span class="text-sm font-medium">Inject Random Errors</span>
          <mat-slide-toggle 
            [ngModel]="params().errorInjection" 
            (ngModelChange)="updateParam('errorInjection', $event)"
            color="warn"
            aria-label="Toggle Error Injection"
          ></mat-slide-toggle>
        </div>

        @if (params().errorInjection) { 
          <div class="slider-group pl-4 border-l-2 border-red-100">
            <div class="slider-header text-red-800">
              <span>Failure Rate</span>
              <span>{{ params().failureRate }}%</span>
            </div>
            <mat-slider min="0" max="100" step="1">
              <input matSliderThumb 
                     [ngModel]="params().failureRate" 
                     (ngModelChange)="updateParam('failureRate', $event)"
                     aria-label="Failure Rate Percentage"
              >
            </mat-slider>
          </div>
        } 

        <!-- Latency Injection -->
        <div class="flex justify-between items-center py-2">
          <span class="text-sm font-medium">Simulate Network Latency</span>
          <mat-slide-toggle 
            [ngModel]="params().latencyInjection" 
            (ngModelChange)="updateParam('latencyInjection', $event)"
            color="accent"
            aria-label="Toggle Latency Injection"
          ></mat-slide-toggle>
        </div>
      </mat-card>

      <!-- Right: Real-time Stats -->
      <div class="flex flex-col gap-4">
        
        <!-- Status Banner -->
        <div class="status-panel">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-3 h-3 rounded-full" [class.bg-green-500]="store.isActive()" [class.bg-gray-300]="!store.isActive()"></div>
            <span class="font-bold text-sm uppercase">{{ store.isActive() ? 'Running' : 'Idle' }}</span>
          </div>

          <div class="metrics-grid">
            <div class="metric-item">
              <div class="metric-val text-blue-600">{{ metrics().activeConnections }}</div>
              <div class="metric-lbl">Active Conn</div>
            </div>
            <div class="metric-item">
              <div class="metric-val text-purple-600">{{ metrics().rps | number:'1.0-0' }}</div>
              <div class="metric-lbl">Req / Sec</div>
            </div>
            <div class="metric-item">
              <div class="metric-val text-red-600">{{ metrics().errorCount }}</div>
              <div class="metric-lbl">Total Errors</div>
            </div>
            <div class="metric-item">
              <div class="metric-val text-amber-600">{{ metrics().avgLatency | number:'1.0-0' }}ms</div>
              <div class="metric-lbl">Avg Latency</div>
            </div>
          </div>
        </div>

        <!-- Live Chart -->
        <mat-card class="flex-grow min-h-[300px] p-4 flex flex-col">
          <h4 class="text-xs font-bold uppercase text-gray-400 mb-2">Throughput History (Last 1 min)</h4>
          <div class="flex-grow relative">
             <viz-chart 
                [dataSet]="chartData()" 
                [config]="chartConfig"
                class="absolute inset-0" 
             ></viz-chart>
          </div>
        </mat-card>

      </div>
    </div>
  `
}) 
export class SimulationComponent implements OnInit { 
  readonly store = inject(SimulationStore); 

  readonly params = this.store.params; 
  readonly metrics = this.store.metrics; 

  readonly chartConfig: ChartConfig = { 
    xKey: 'time', yKey: 'value', stackBy: 'type' 
  }; 

  readonly chartData = computed<TableDataSet>(() => { 
    const history = this.store.history(); 
    // Flatten History for VizChart
    // Format: [{time: '10:00:01', type: 'Success', value: 50}, {time: '10:00:01', type: 'Error', value: 2}]
    const rows: Record<string, any>[] = []; 
    
    history.forEach(h => { 
        const dateStr = new Date(h.timestamp).toLocaleTimeString(); 
        rows.push({ time: dateStr, type: 'Success', value: h.rps - h.errors }); 
        rows.push({ time: dateStr, type: 'Error', value: h.errors }); 
    }); 

    return { 
        columns: ['time', 'type', 'value'], 
        data: rows 
    }; 
  }); 

  ngOnInit() { 
    // Ensure we start clean
    this.store.reset(); 
  } 

  updateParam(key: string, value: any) { 
    this.store.updateParams({ [key]: value }); 
  } 
}