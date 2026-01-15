/**
 * @fileoverview Heatmap Visualization.
 * Density Grid for Time-series or Category Analysis.
 */

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { TableDataSet } from '../viz-table/viz-table.component'; 
import { MatTooltipModule } from '@angular/material/tooltip'; 

@Component({ 
  selector: 'viz-heatmap', 
  imports: [CommonModule, MatTooltipModule], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; width: 100%; overflow: auto; padding: 16px; } 
    .heatmap-container { display: grid; gap: 2px; align-items: stretch; justify-items: stretch; } 
    .cell { position: relative; width: 100%; min-width: 30px; height: 30px; border-radius: 2px; } 
    .cell:hover { border: 1px solid #333; z-index: 10; } 
    
    .axis-label { font-size: 10px; color: var(--sys-text-secondary); display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } 
    .y-label { justify-content: flex-end; padding-right: 8px; font-weight: 500; } 
    .x-label { font-weight: 500; } 
    
    .legend { margin-top: 16px; font-size: 11px; color: var(--sys-text-secondary); display: flex; align-items: center; gap: 8px; justify-content: flex-end; } 
    .legend-bar { width: 100px; height: 8px; background: linear-gradient(to right, #fff5f5, #b71c1c); border-radius: 4px; } 
  `], 
  template: `
    @if (matrix(); as m) { 
      <div 
        class="heatmap-container" 
        [style.grid-template-columns]="'auto repeat(' + m.xHeaders.length + ', 1fr)'" 
        role="grid"
        aria-label="Heatmap Data Grid"
      >
        <!-- Top Left Corner (Empty) -->
        <div aria-hidden="true"></div>

        <!-- X Axis Header (Hours) -->
        @for (hx of m.xHeaders; track hx) { 
          <div class="axis-label x-label" role="columnheader">{{ hx }}</div>
        } 

        <!-- Rows -->
        @for (hy of m.yHeaders; track hy) { 
          <!-- Y Axis Label (Service) -->
          <div class="axis-label y-label" [title]="hy" role="rowheader">{{ hy }}</div>

          <!-- Cells -->
          @for (hx of m.xHeaders; track hx) { 
            <div 
              class="cell" 
              role="gridcell"
              [style.background-color]="getCellColor(m, hx, hy)" 
              [matTooltip]="getCellTooltip(m, hx, hy)" 
              [attr.aria-label]="getCellTooltip(m, hx, hy)"
            ></div>
          } 
        } 
      </div>

      <div class="legend" aria-hidden="true">
        <span>Low Load</span>
        <div class="legend-bar"></div>
        <span>High Load</span>
      </div>
    } @else { 
      <div class="flex items-center justify-center h-full text-gray-500">No Data</div>
    } 
  `
}) 
export class VizHeatmapComponent { 
  readonly dataSet = input.required<TableDataSet | null>(); 

  readonly matrix = computed(() => { 
    const ds = this.dataSet(); 
    if (!ds || ds.data.length === 0) return null; 

    // Detect Columns: Assumes [Service, Hour, Value]
    const cols = ds.columns; 
    const yKey = cols[0]; // Dim 1 (Service)
    const xKey = cols[1]; // Dim 2 (Hour)
    const valKey = cols[2]; // Measure

    const xSet = new Set<string>(); 
    const ySet = new Set<string>(); 
    const dataMap = new Map<string, number>(); 
    
    let min = 0; 
    let max = 0; 

    ds.data.forEach(row => { 
      const x = String(row[xKey]); 
      const y = String(row[yKey]); 
      const val = Number(row[valKey]) || 0; 
      
      xSet.add(x); 
      ySet.add(y); 
      dataMap.set(`${x}:${y}`, val); 

      if (val < min) min = val; 
      if (val > max) max = val; 
    }); 

    const xHeaders = Array.from(xSet).sort((a,b) => Number(a) - Number(b)); 
    const yHeaders = Array.from(ySet).sort(); 

    return { xHeaders, yHeaders, dataMap, min, max }; 
  }); 

  getCellColor(m: any, x: string, y: string): string { 
    const val = m.dataMap.get(`${x}:${y}`) || 0; 
    const range = m.max - m.min || 1; 
    const pct = (val - m.min) / range; 
    
    // Scale: White -> Red (#b71c1c)
    return `rgba(183, 28, 28, ${Math.max(0.1, pct)})`; 
  } 

  getCellTooltip(m: any, x: string, y: string): string { 
    const val = m.dataMap.get(`${x}:${y}`) || 0; 
    return `${y} @ Hour ${x}: ${val}`; 
  } 
}