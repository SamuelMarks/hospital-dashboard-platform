/** 
 * @fileoverview Reusable Data Table Visualization. 
 * 
 * Adapts raw API datasets into an Angular Material Table structure. 
 * Features: 
 * - Dynamic Column generation relative to the dataset. 
 * - Client-side Pagination. 
 * - **NEW**: Conditional formatting for Delta/Change columns. 
 */ 

import { Component, input, computed, ChangeDetectionStrategy, ViewChild, effect } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 

// Material Imports
import { MatTableModule, MatTableDataSource } from '@angular/material/table'; 
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'; 

export interface TableDataSet { 
  columns: string[]; 
  data: Record<string, any>[]; 
} 

@Component({ 
  selector: 'viz-table', 
  imports: [CommonModule, MatTableModule, MatPaginatorModule], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; overflow: hidden; } 
    .table-container { flex-grow: 1; overflow: auto; } 
    table { width: 100%; } 
    th.mat-header-cell { 
      background: #fafafa; font-weight: 600; color: #616161; 
      text-transform: uppercase; font-size: 11px; 
    } 
    /* Conditional Formatting Classes */ 
    .val-pos { color: #2e7d32; font-weight: 500; } 
    .val-neg { color: #c62828; font-weight: 500; } 
  `], 
  template: `
    <div class="table-container">
      <table mat-table [dataSource]="dataSource" class="mat-elevation-z0" aria-label="Data Results Table">
        
        @for (col of finalColumns(); track col) { 
          <ng-container [matColumnDef]="col">
            <th mat-header-cell *matHeaderCellDef scope="col"> {{ col }} </th>
            <td mat-cell *matCellDef="let row"> 
              <!-- Applied heuristic styling wrapper -->
              <span [ngClass]="getCellClass(row, col)">
                {{ getCellValue(row, col) }} 
              </span>
            </td>
          </ng-container>
        } 

        <tr mat-header-row *matHeaderRowDef="finalColumns(); sticky: true"></tr>
        <tr mat-row *matRowDef="let row; columns: finalColumns();"></tr>

        <tr *matNoDataRow>
          <td [attr.colspan]="finalColumns().length" class="p-8 text-center text-gray-500 italic">
            No data available
          </td>
        </tr>

      </table>
    </div>
    
    <mat-paginator 
      [pageSize]="10" 
      [pageSizeOptions]="[5, 10, 20]" 
      showFirstLastButtons
      class="border-t" 
      aria-label="Table Paginator" 
    ></mat-paginator>
  `
}) 
export class VizTableComponent { 
  readonly dataSet = input<TableDataSet | null | undefined>(); 
  dataSource = new MatTableDataSource<Record<string, any>>([]); 
  @ViewChild(MatPaginator) paginator!: MatPaginator; 

  constructor() { 
    effect(() => { 
      const db = this.dataSet(); 
      if (db?.data) { 
        this.dataSource.data = db.data; 
        if (this.paginator) { this.dataSource.paginator = this.paginator; } 
      } else { 
        this.dataSource.data = []; 
      } 
    }); 
  } 

  readonly finalColumns = computed(() => this.dataSet()?.columns || []); 

  getCellValue(row: Record<string, any>, col: string): string { 
    const val = row[col]; 
    if (val === null || val === undefined) return '-'; 
    if (typeof val === 'object') return JSON.stringify(val); 
    // Format Delta with sign
    if (this.isDeltaColumn(col) && typeof val === 'number') { 
        return (val > 0 ? '+' : '') + val; 
    } 
    return String(val); 
  } 

  getCellClass(row: Record<string, any>, col: string): string { 
    if (this.isDeltaColumn(col)) { 
      const val = row[col] as number; 
      if (val > 0) return 'val-pos'; 
      if (val < 0) return 'val-neg'; 
    } 
    return ''; 
  } 

  private isDeltaColumn(col: string): boolean { 
    const lower = col.toLowerCase(); 
    return lower === 'delta' || lower.includes('change') || lower.includes('net_flow'); 
  } 
}