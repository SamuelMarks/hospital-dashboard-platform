/**
 * @fileoverview Filter bar subcomponent for `AnalyticsComponent`.
 *
 * Provides search text and dropdown filters for LLM model, clinician user,
 * selection score, SQL presence, and arena source.
 */

import { Component, input, model, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { extractEventInputValue } from '../shared/utils/dom-event.utils';

/**
 * Filter bar component for the LLM Arena Analytics dashboard.
 */
@Component({
  selector: 'app-analytics-filter-bar',
  imports: [
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <mat-card class="filters-card">
      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label i18n>Search</mat-label>
          <input
            matInput
            i18n-placeholder
            placeholder="Query, SQL, model, or user"
            [value]="searchText()"
            (input)="searchText.set(getEventValue($event))"
          />
          @if (searchText()) {
            <button
              type="button"
              mat-icon-button
              matSuffix
              (click)="searchText.set('')"
              i18n-aria-label
              aria-label="Clear search"
            >
              <mat-icon aria-hidden="true">close</mat-icon>
            </button>
          }
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label i18n>Model</mat-label>
          <mat-select [value]="modelFilter()" (selectionChange)="modelFilter.set($event.value)">
            <mat-option i18n value="all">All models</mat-option>
            @for (model of models(); track model) {
              <mat-option [value]="model">{{ model }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label i18n>User</mat-label>
          <mat-select [value]="userFilter()" (selectionChange)="userFilter.set($event.value)">
            <mat-option i18n value="all">All users</mat-option>
            @for (user of users(); track user) {
              <mat-option [value]="user">{{ user }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label i18n>Score</mat-label>
          <mat-select [value]="scoreFilter()" (selectionChange)="scoreFilter.set($event.value)">
            <mat-option i18n value="all">All outcomes</mat-option>
            <mat-option i18n value="selected">Selected</mat-option>
            <mat-option i18n value="unselected">Not selected</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label i18n>SQL</mat-label>
          <mat-select [value]="sqlFilter()" (selectionChange)="sqlFilter.set($event.value)">
            <mat-option i18n value="all">All</mat-option>
            <mat-option i18n value="with_sql">With SQL</mat-option>
            <mat-option i18n value="no_sql">No SQL</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label i18n>Source</mat-label>
          <mat-select [value]="sourceFilter()" (selectionChange)="sourceFilter.set($event.value)">
            <mat-option i18n value="all">All sources</mat-option>
            <mat-option i18n value="chat">Chat Arena</mat-option>
            <mat-option i18n value="ai">AI Arena</mat-option>
          </mat-select>
        </mat-form-field>

        <div class="actions">
          <button i18n type="button" mat-stroked-button (click)="clearFilters.emit()">Clear</button>
        </div>
      </div>
    </mat-card>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .filters-card {
        border: 1px solid var(--sys-surface-border);
        background: var(--sys-surface);
        padding: 12px 16px;
      }
      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        align-items: end;
      }
      .filters .actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
    `,
  ],
})
export class AnalyticsFilterBarComponent {
  /** Active search filter string (two-way bound). */
  readonly searchText = model<string>('');
  /** Active LLM model filter value (two-way bound). */
  readonly modelFilter = model<string>('all');
  /** Active user email filter value (two-way bound). */
  readonly userFilter = model<string>('all');
  /** Active selection score filter value (two-way bound). */
  readonly scoreFilter = model<string>('all');
  /** Active SQL presence filter value (two-way bound). */
  readonly sqlFilter = model<string>('all');
  /** Active arena source filter value (two-way bound). */
  readonly sourceFilter = model<string>('all');
  /** Available distinct model names for the dropdown. */
  readonly models = input<string[]>([]);
  /** Available distinct user emails for the dropdown. */
  readonly users = input<string[]>([]);

  /** Emits when the Clear button is clicked. */
  readonly clearFilters = output<void>();

  /**
   * Extracts the string value from a DOM input event.
   *
   * @param event - DOM input event from the search box.
   * @returns Extracted string value.
   */
  getEventValue(event: Event): string {
    return extractEventInputValue(event);
  }
}
