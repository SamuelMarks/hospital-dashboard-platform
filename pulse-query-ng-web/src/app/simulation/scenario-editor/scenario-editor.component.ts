import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { FormsModule } from '@angular/forms'; 

import { MatSliderModule } from '@angular/material/slider'; 
import { MatButtonModule } from '@angular/material/button'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatInputModule } from '@angular/material/input'; 
import { MatFormFieldModule } from '@angular/material/form-field'; 
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; 

import { SimulationStore } from '../simulation.service'; 
import { VizTableComponent, TableDataSet } from '../../shared/visualizations/viz-table/viz-table.component'; 
import { VizChartComponent } from '../../shared/visualizations/viz-chart/viz-chart.component'; 

@Component({ 
  selector: 'app-scenario-editor', 
  standalone: true, 
  imports: [ 
    CommonModule, 
    FormsModule, 
    MatSliderModule, 
    MatButtonModule, 
    MatIconModule, 
    MatInputModule, 
    MatFormFieldModule, 
    MatProgressSpinnerModule, 
    VizTableComponent, 
    VizChartComponent
  ], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  templateUrl: './scenario-editor.component.html', 
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; } 
    .scenario-layout { display: flex; height: 100%; } 
    .config-pane { 
      width: 320px; 
      background: white; 
      border-right: 1px solid #e0e0e0; 
      padding: 24px; 
      display: flex; 
      flex-direction: column; 
      overflow-y: auto; 
      z-index: 2; 
    } 
    .results-pane { 
      flex: 1; 
      background-color: #f5f5f5; 
      display: flex; 
      flex-direction: column; 
      overflow: hidden; 
    } 
    .section-title { 
      font-size: 12px; font-weight: 700; text-transform: uppercase; color: #757575; 
      margin-bottom: 12px; 
    } 
    .capacity-row { display: block; margin-bottom: 16px; } 
    .unit-label { font-size: 14px; font-weight: 500; display: block; margin-bottom: -8px; } 
    .slider-group { display: flex; align-items: center; gap: 12px; } 
    .val-badge { 
      background: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 13px; min-width: 30px; text-align: center; 
    } 
    textarea { resize: none; font-size: 11px; } 
    .empty-state { 
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #9e9e9e; 
    } 
    .viz-wrapper { 
      background: white; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; 
    } 
    .kpi-badge { background: #e8f5e9; color: #2e7d32; padding: 8px 16px; border-radius: 20px; font-size: 14px; } 
  `] 
}) 
export class ScenarioEditorComponent { 
  readonly store = inject(SimulationStore); 

  readonly units = computed(() => Object.keys(this.store.capacityMap())); 

  readonly tableData = computed<TableDataSet | null>(() => { 
    const res = this.store.results(); 
    if (!res) return null; 
    
    // Sort logic to put movements first
    const sorted = [...res].sort((a, b) => Math.abs(b.Delta) - Math.abs(a.Delta)); 

    const rows = sorted.map(a => ({ 
      Service: a.Service, 
      Unit: a.Unit, 
      Allocated: a.Patient_Count, 
      Original: a.Original_Count, 
      Delta: a.Delta
    })); 
    return { 
      columns: ['Service', 'Unit', 'Allocated', 'Original', 'Delta'], 
      data: rows 
    }; 
  }); 

  // Chart 1: Total Allocated
  readonly allocationData = computed<TableDataSet | null>(() => { 
    const res = this.store.results(); 
    if (!res) return null; 
    const rows = res.map(a => ({ Unit: a.Unit, Service: a.Service, Patients: a.Patient_Count })); 
    return { columns: ['Unit', 'Service', 'Patients'], data: rows }; 
  }); 

  // Chart 2: Deviations
  readonly deviationData = computed<TableDataSet | null>(() => { 
    const res = this.store.results(); 
    if (!res) return null; 
    // Filter to significant changes to reduce noise
    const rows = res 
      .filter(a => Math.abs(a.Delta) > 0.1) 
      .map(a => ({ Unit: a.Unit, Service: a.Service, Delta: a.Delta })); 
    return { columns: ['Unit', 'Service', 'Delta'], data: rows }; 
  }); 

  readonly totalAllocated = computed(() => { 
    const res = this.store.results(); 
    return res ? res.reduce((acc, curr) => acc + curr.Patient_Count, 0).toFixed(1) : '0'; 
  }); 

  getCapacity(unit: string): number { 
    return this.store.capacityMap()[unit]; 
  } 

  setCapacity(unit: string, val: number): void { 
    this.store.updateCapacity(unit, val); 
  } 
}