/**
 * @fileoverview Filter Ribbon Component.
 *
 * **Updates**:
 * - Migrated to `@angular/forms/signals` (Signal Forms).
 * - Removed `ReactiveFormsModule`.
 */

import { Component, inject, linkedSignal, LOCALE_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { formatDate } from '@angular/common';
import { Router, ActivatedRoute, ParamMap } from '@angular/router';
import { form } from '@angular/forms/signals';

// Material Imports
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';

import { parseIsoDate } from '../core/time.token';
import { DashboardStore } from './dashboard.store';

/** Filter ribbon state shape synchronized with URL query parameters. */
export interface FilterRibbonModel {
  /** Selected hospital department filter or `null` for all departments. */
  dept: string | null;
  /** Selected reporting period start date or `null`. */
  startDate: Date | null;
  /** Selected reporting period end date or `null`. */
  endDate: Date | null;
}

/**
 * Sticky dashboard filter ribbon synchronizing global department and date range filters with URL query parameters.
 */
@Component({
  selector: 'app-filter-ribbon',
  imports: [
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
export class FilterRibbonComponent {
  /** Access to dashboard state (global params). */
  public readonly store = inject(DashboardStore);
  /** Angular router used to persist global filter parameters in URL query strings. */
  private readonly router = inject(Router);
  /** Activated route used to read initial filter query parameters from the URL. */
  private readonly route = inject(ActivatedRoute);
  /** Active application locale identifier. */
  private readonly localeId = inject(LOCALE_ID);

  /** Reactive signal tracking the active route query parameter map. */
  private readonly queryParamMap = toSignal<ParamMap | null>(this.route.queryParamMap, {
    initialValue: null,
  });

  /**
   * Form model derived from `route.queryParamMap` via `linkedSignal()` while allowing
   * local two-way updates as the user selects dates or departments.
   */
  readonly formModel = linkedSignal<ParamMap | null, FilterRibbonModel>({
    source: this.queryParamMap,
    computation: (params) => ({
      dept: params?.get('dept') || null,
      startDate: parseIsoDate(params?.get('start_date')),
      endDate: parseIsoDate(params?.get('end_date')),
    }),
  });

  /** Signal Form wrapping `formModel`. */
  readonly ribbonForm = form(this.formModel);

  /**
   * Handles changes to the department filter.
   *
   * @param value - The selected department or `null`.
   */
  onDeptChange(value: string | null): void {
    this.ribbonForm.dept().value.set(value);
    this.updateFilter('dept', value);
  }

  /**
   * Updates the start date in the filter model and synchronizes route query parameters when both bounds are set.
   *
   * @param date - The newly selected start Date or null.
   */
  onStartDateChange(date: Date | null): void {
    this.ribbonForm.startDate().value.set(date);
    this.onDateChange();
  }

  /**
   * Updates the end date in the filter model and synchronizes route query parameters when both bounds are set.
   *
   * @param date - The newly selected end Date or null.
   */
  onEndDateChange(date: Date | null): void {
    this.ribbonForm.endDate().value.set(date);
    this.onDateChange();
  }

  /** Navigates with updated `start_date` and `end_date` query parameters when both bounds are populated. */
  onDateChange(): void {
    const s = this.ribbonForm.startDate().value();
    const e = this.ribbonForm.endDate().value();

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

  /** Clears all global department and date range filters from the URL query string. */
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
