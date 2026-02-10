/** 
 * @fileoverview Filter Ribbon Component. 
 * 
 * **Updates**: 
 * - Switched container to `MatToolbar` for standard Material container behavior. 
 * - Standardized spacing and alignment using M3 density properties. 
 */ 

import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms'; 
import { Router, ActivatedRoute } from '@angular/router'; 
import { Subject, takeUntil } from 'rxjs'; 

// Material Imports 
import { MatToolbarModule } from '@angular/material/toolbar'; 
import { MatFormFieldModule } from '@angular/material/form-field'; 
import { MatSelectModule } from '@angular/material/select'; 
import { MatInputModule } from '@angular/material/input'; 
import { MatDatepickerModule } from '@angular/material/datepicker'; 
import { MatIconModule } from '@angular/material/icon'; 
import { MatButtonModule } from '@angular/material/button'; 
import { provideNativeDateAdapter } from '@angular/material/core'; 

import { DashboardStore } from './dashboard.store'; 

/** 
 * Component Class. 
 */ 
@Component({ 
  selector: 'app-filter-ribbon', 
  imports: [ 
    CommonModule, 
    ReactiveFormsModule, 
    MatToolbarModule, 
    MatFormFieldModule, 
    MatSelectModule, 
    MatInputModule, 
    MatDatepickerModule, 
    MatIconModule, 
    MatButtonModule
  ], 
  providers: [provideNativeDateAdapter()], 
  changeDetection: ChangeDetectionStrategy.OnPush, 
    templateUrl: './filter-ribbon.component.html', 
  styles: [`
    :host { display: block; position: sticky; top: 0; z-index: 900; } 
    
    .filter-toolbar { 
      background-color: var(--sys-background); 
      border-bottom: 1px solid var(--sys-surface-border); 
      height: 56px; 
      padding: 0 24px; 
      display: flex; 
      gap: 24px; 
      align-items: center; 
    } 

    .filter-label { 
      display: flex; align-items: center; gap: 8px; user-select: none; 
    } 
    .label-text { 
      font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--sys-text-secondary); 
    } 
    .icon-small { font-size: 18px; width: 18px; height: 18px; } 
    .text-secondary { color: var(--sys-text-secondary); } 

    .filter-group { 
      display: flex; align-items: center; gap: 12px; height: 100%; 
    } 

    /* Compact Field Widths */ 
    .ribbon-field { min-width: 180px; font-size: 13px; } 
    .date-field { min-width: 240px; font-size: 13px; } 
    
    /* Override internal spacing for compactness in toolbar */ 
    ::ng-deep .mat-mdc-form-field-flex { align-items: center !important; } 
  `] 
}) 
export class FilterRibbonComponent implements OnInit, OnDestroy { 
  /** Access to dashboard state (global params). */ 
  public readonly store = inject(DashboardStore); 
    /** router property. */
private readonly router = inject(Router); 
    /** route property. */
private readonly route = inject(ActivatedRoute); 
  
    /** destroy$ property. */
private readonly destroy$ = new Subject<void>(); 

  // Form Controls 
  /** Start Date. */
  readonly startDate = new FormControl<Date | null>(null); 
  /** End Date. */
  readonly endDate = new FormControl<Date | null>(null); 
  /** Dept Control. */
  readonly deptControl = new FormControl<string | null>(null); 

  /** Ng On Init. */
  ngOnInit(): void { 
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => { 
      const start = params.get('start_date'); 
      const end = params.get('end_date'); 
      const dept = params.get('dept'); 

      if (start) this.startDate.setValue(new Date(start), { emitEvent: false }); 
      if (end) this.endDate.setValue(new Date(end), { emitEvent: false }); 
      this.deptControl.setValue(dept || null, { emitEvent: false }); 
    }); 

    this.deptControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(val => { 
      this.updateFilter('dept', val); 
    }); 
  } 

  /** Ng On Destroy. */
  ngOnDestroy(): void { 
    this.destroy$.next(); 
    this.destroy$.complete(); 
  } 

  /** Handles date Change. */
  onDateChange(): void { 
    const s = this.startDate.value; 
    const e = this.endDate.value; 
    
    if (s && e) { 
      const sStr = this.formatDate(s); 
      const eStr = this.formatDate(e); 
      
      this.router.navigate([], { 
        relativeTo: this.route, 
        queryParams: { start_date: sStr, end_date: eStr }, 
        queryParamsHandling: 'merge' 
      }); 
    } 
  } 

  /** Clear Filters. */
  clearFilters(): void { 
    this.router.navigate([], { 
      relativeTo: this.route, 
      queryParams: { start_date: null, end_date: null, dept: null }, 
      queryParamsHandling: 'merge' 
    }); 
    
    this.startDate.reset(); 
    this.endDate.reset(); 
    this.deptControl.reset(); 
  } 

    /** updateFilter method. */
private updateFilter(key: string, value: any): void { 
    this.router.navigate([], { 
      relativeTo: this.route, 
      queryParams: { [key]: value || null }, 
      queryParamsHandling: 'merge' 
    }); 
  } 

    /** formatDate method. */
private formatDate(d: Date): string { 
    return d.toISOString().split('T')[0]; 
  } 
}