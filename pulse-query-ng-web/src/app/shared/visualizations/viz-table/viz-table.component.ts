/**
 * @fileoverview Reusable Data Table Visualization.
 * 
 * Adapts raw API datasets into an Angular Material Table structure.
 * Features:
 * - Dynamic Column generation relative to the dataset.
 * - Client-side Pagination.
 */

import { Component, input, computed, ChangeDetectionStrategy, ViewChild, EffectRef, effect } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 

// Material Imports
import { MatTableModule, MatTableDataSource } from '@angular/material/table'; 
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator'; 

/** 
 * Interface representing the expected structure for Table Data. 
 */ 
export interface TableDataSet { 
  columns: string[]; 
  data: Record<string, any>[]; 
} 

/** 
 * Visualization: Table Component.
 * 
 * Renders a paginated table using Material Design.
 * 
 * **Best Practices:**
 * - Uses `input()` signals for data binding.
 * - Uses `effect()` to synchronize the Signal -> DataSource imperative API.
 */ 
@Component({ 
  selector: 'viz-table', 
  // 'standalone: true' omitted (default)
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
  `], 
  template: `
    <div class="table-container">
      <table mat-table [dataSource]="dataSource" class="mat-elevation-z0" aria-label="Data Results Table">
        
        <!-- Usage of dynamic columns iterating over the signal -->
        @for (col of finalColumns(); track col) { 
          <ng-container [matColumnDef]="col">
            <th mat-header-cell *matHeaderCellDef scope="col"> {{ col }} </th>
            <td mat-cell *matCellDef="let row"> 
              {{ getCellValue(row, col) }} 
            </td>
          </ng-container>
        } 

        <tr mat-header-row *matHeaderRowDef="finalColumns(); sticky: true"></tr>
        <tr mat-row *matRowDef="let row; columns: finalColumns();"></tr>

        <!-- Empty State -->
        <tr *matNoDataRow>
          <td [attr.colspan]="finalColumns().length" class="p-8 text-center text-gray-500 italic">
            No data available
          </td>
        </tr>

      </table>
    </div>
    
    <!-- Paginator -->
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
  /** Input Data Signal. Can be null during loading. */ 
  readonly dataSet = input<TableDataSet | null | undefined>(); 

  /** Internal Material Data Source used for Pagination/Sorting logic. */ 
  dataSource = new MatTableDataSource<Record<string, any>>([]); 

  /** View Reference to paginator to attach to source. */ 
  @ViewChild(MatPaginator) paginator!: MatPaginator; 

  constructor() { 
    // Effect: Sync input data -> MatTableDataSource
    effect(() => { 
      const db = this.dataSet(); 
      if (db?.data) { 
        this.dataSource.data = db.data; 
        
        // Ensure Paginator is attached after data update
        // (ViewChild settles after AfterViewInit, but effect runs in CD cycle)
        if (this.paginator) { 
          this.dataSource.paginator = this.paginator; 
        } 
      } else { 
        this.dataSource.data = []; 
      } 
    }); 
  } 

  /** Computed list of column headers. Safe fallback to empty array. */ 
  readonly finalColumns = computed(() => { 
    return this.dataSet()?.columns || []; 
  }); 

  /** 
   * Formats cell values for display.
   * Handles objects (JSON stringify) and nulls.
   * 
   * @param {Record<string, any>} row - Data row.
   * @param {string} col - Column Key.
   */ 
  getCellValue(row: Record<string, any>, col: string): string { 
    const val = row[col]; 
    if (val === null || val === undefined) return '-'; 
    if (typeof val === 'object') return JSON.stringify(val); 
    return String(val); 
  } 
}