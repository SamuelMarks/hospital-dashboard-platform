/**
 * @fileoverview Filter Ribbon Component.
 *
 * **Updates**:
 * - Migrated to `@angular/forms/signals` (Signal Forms).
 * - Removed `ReactiveFormsModule`.
 */

import { Component, inject, OnInit, OnDestroy, signal, LOCALE_ID } from '@angular/core';
import { formatDate } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FormRoot, FormField, form } from '@angular/forms/signals';

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
    FormRoot,
    FormField,
    MatToolbarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatIconModule,
    MatButtonModule,
  ],
  providers: [provideNativeDateAdapter()],

  templateUrl: './filter-ribbon.component.html',
  styles: [
    `
      :host {
        display: block;
        position: sticky;
        top: 0;
        z-index: 900;
      }

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
        display: flex;
        align-items: center;
        gap: 8px;
        user-select: none;
      }
      .label-text {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--sys-text-secondary);
      }
      .icon-small {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .text-secondary {
        color: var(--sys-text-secondary);
      }

      .filter-group {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 100%;
      }

      /* Compact Field Widths */
      .ribbon-field {
        min-width: 180px;
        font-size: 13px;
      }
      .date-field {
        min-width: 240px;
        font-size: 13px;
      }
    `,
  ],
})
export class FilterRibbonComponent implements OnInit, OnDestroy {
  /** Access to dashboard state (global params). */
  public readonly store = inject(DashboardStore);
  /** Angular router used to persist global filter parameters in URL query strings. */
  private readonly router = inject(Router);
  /** Activated route used to read initial filter query parameters from the URL. */
  private readonly route = inject(ActivatedRoute);
  /** Active application locale identifier. */
  private readonly localeId = inject(LOCALE_ID);

  /** Subject emitting on component destruction to tear down route query parameter subscriptions. */
  private readonly destroy$ = new Subject<void>();

  /** Form model containing the current filter values. */
  readonly formModel = signal({
    dept: null as string | null,
    startDate: null as Date | null,
    endDate: null as Date | null,
  });

  /** The form control for the ribbon. */
  readonly ribbonForm = form(this.formModel);

  /** Flag to prevent emit loops while syncing from route. */
  isSyncingFromRoute = false;

  /** Synchronizes global department and date range filter controls from route query parameters. */
  ngOnInit(): void {
    // Sync from Route to Form
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const start = params.get('start_date');
      const end = params.get('end_date');
      const dept = params.get('dept');

      this.isSyncingFromRoute = true;
      const val = this.formModel();

      this.formModel.set({
        ...val,
        dept: dept || null,
        startDate: start ? new Date(start) : null,
        endDate: end ? new Date(end) : null,
      });
      this.isSyncingFromRoute = false;
    });

    // Sync from Form to Route (dept)
    // In signal forms, we manually observe or use effects,
    // but since we want to respond to the model changes, let's subscribe to changes.
    // Wait, the easiest way to observe value changes dynamically in angular 22 forms
    // is to use effect, but since we want to unsubscribe on destroy without issue,
    // we can either hook into the template events or use an effect.
    // Effect runs inside injection context automatically here.
  }

  /**
   * Handles changes to the department filter.
   * @param value The selected department.
   */
  onDeptChange(value: string | null): void {
    if (this.isSyncingFromRoute) return;
    this.updateFilter('dept', value);
  }

  /** Completes the destruction subject to clean up route query parameter subscriptions. */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Handles date Change. */
  onDateChange(): void {
    const s = this.formModel().startDate;
    const e = this.formModel().endDate;

    if (s && e) {
      const sStr = this.formatDate(s);
      const eStr = this.formatDate(e);

      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { start_date: sStr, end_date: eStr },
        queryParamsHandling: 'merge',
      });
    }
  }

  /** Clear Filters. */
  clearFilters(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { start_date: null, end_date: null, dept: null },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Updates a single query parameter filter in the router URL.
   *
   * @param key - The query parameter key to update.
   * @param value - The new filter value or null to clear.
   */
  private updateFilter(key: string, value: string | null): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [key]: value || null },
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Formats a Date instance as an ISO YYYY-MM-DD date string using Angular's locale-aware formatter.
   *
   * @param d - The Date instance to format.
   * @returns Formatted YYYY-MM-DD string.
   */
  private formatDate(d: Date): string {
    return formatDate(d, 'yyyy-MM-dd', this.localeId, 'UTC');
  }
}
