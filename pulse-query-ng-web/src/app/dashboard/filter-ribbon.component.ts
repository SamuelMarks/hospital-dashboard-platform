/** 
 * @fileoverview Filter Ribbon Component. 
 * 
 * A persistent sub-header that houses data manipulation controls. 
 * Separates "Data Context" (Date Range, Department) from "Application Context" (Navigation, Settings). 
 * 
 * Features: 
 * - Date Range Picker (Start/End). 
 * - Department Dropdown. 
 * - Syncs state with URL Query Parameters. 
 */ 

import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core'; 
import { CommonModule } from '@angular/common'; 
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms'; 
import { Router, ActivatedRoute } from '@angular/router'; 
import { Subject, takeUntil } from 'rxjs'; 

// Material Imports
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
  standalone: true, 
  imports: [ 
    CommonModule, 
    ReactiveFormsModule, 
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
    :host { 
      display: block; 
      position: sticky; 
      top: 64px; /* Height of the main toolbar */ 
      z-index: 900; 
      background-color: var(--sys-background); 
      border-bottom: 1px solid var(--sys-surface-border); 
      padding: 12px 24px; 
      transition: top 0.2s, background-color 0.3s; 
    } 

    .ribbon-container { 
      display: flex; 
      align-items: center; 
      gap: 16px; 
      flex-wrap: wrap; 
      max-width: 1920px; 
      margin: 0 auto; 
    } 

    .filter-label { 
      font-size: 11px; 
      font-weight: 600; 
      text-transform: uppercase; 
      color: var(--sys-text-secondary); 
      margin-right: 8px; 
      display: flex; 
      align-items: center; 
      gap: 4px; 
    } 

    /* Compact Form Fields for Ribbon Density */ 
    .ribbon-field { 
      font-size: 13px; 
      min-width: 160px; 
    } 
    .date-field { 
      min-width: 240px; 
    } 

    /* Material Overrides for Density - using ::ng-deep to penetrade encapsulated view styles 
       Ideally moved to global styles if used frequently, but specific to this ribbon layout */ 
    ::ng-deep .ribbon-field .mat-mdc-text-field-wrapper, 
    ::ng-deep .date-field .mat-mdc-text-field-wrapper { 
      height: 40px; 
      padding-top: 0; 
      background-color: var(--sys-surface); 
    } 
    ::ng-deep .ribbon-field .mat-mdc-form-field-flex, 
    ::ng-deep .date-field .mat-mdc-form-field-flex { 
      height: 40px; 
      align-items: center; 
    } 
    ::ng-deep .ribbon-field .mat-mdc-form-field-subscript-wrapper, 
    ::ng-deep .date-field .mat-mdc-form-field-subscript-wrapper { 
      display: none; /* Hide hint/error spacing for tight layout */ 
    } 
  `] 
}) 
export class FilterRibbonComponent implements OnInit, OnDestroy { 
  /** Access to dashboard state (global params). */ 
  public readonly store = inject(DashboardStore); 
  private readonly router = inject(Router); 
  private readonly route = inject(ActivatedRoute); 
  
  private readonly destroy$ = new Subject<void>(); 

  // Form Controls
  /** Control for Start Date of the range. */ 
  readonly startDate = new FormControl<Date | null>(null); 
  /** Control for End Date of the range. */ 
  readonly endDate = new FormControl<Date | null>(null); 
  /** Control for Department Selection. */ 
  readonly deptControl = new FormControl<string | null>(null); 

  ngOnInit(): void { 
    // 1. Sync Controls from URL Params on Load/Change
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(params => { 
      const start = params.get('start_date'); 
      const end = params.get('end_date'); 
      const dept = params.get('dept'); 

      // Use { emitEvent: false } to prevent cyclical navigation loops
      if (start) this.startDate.setValue(new Date(start), { emitEvent: false }); 
      if (end) this.endDate.setValue(new Date(end), { emitEvent: false }); 
      this.deptControl.setValue(dept || null, { emitEvent: false }); 
    }); 

    // 2. Listen for Dept Changes -> Navigate
    this.deptControl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(val => { 
      this.updateFilter('dept', val); 
    }); 
  } 

  ngOnDestroy(): void { 
    this.destroy$.next(); 
    this.destroy$.complete(); 
  } 

  /** 
   * Handler for Date Range Picker separation changes. 
   * Navigates only when both Start and End values are valid. 
   */ 
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

  /** 
   * Clears all active filters via navigation. 
   */ 
  clearFilters(): void { 
    this.router.navigate([], { 
      relativeTo: this.route, 
      queryParams: { start_date: null, end_date: null, dept: null }, 
      queryParamsHandling: 'merge' 
    }); 
    
    // Reset form controls
    this.startDate.reset(); 
    this.endDate.reset(); 
    this.deptControl.reset(); 
  } 

  /** 
   * Generic navigation helper for updating a single query param. 
   * 
   * @param {string} key - Query Parameter Key. 
   * @param {any} value - The value to set (null removes it). 
   */ 
  private updateFilter(key: string, value: any): void { 
    this.router.navigate([], { 
      relativeTo: this.route, 
      queryParams: { [key]: value || null }, 
      queryParamsHandling: 'merge' 
    }); 
  } 

  /** 
   * Utility: Format Date object to YYYY-MM-DD. 
   * 
   * @param {Date} d - The date to format. 
   * @returns {string} ISO date string. 
   */ 
  private formatDate(d: Date): string { 
    return d.toISOString().split('T')[0]; 
  } 
}