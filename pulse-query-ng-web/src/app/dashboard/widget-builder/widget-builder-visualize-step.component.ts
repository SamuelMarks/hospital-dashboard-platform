/**
 * @fileoverview Visualization configuration step subcomponent for `WidgetBuilderComponent`.
 *
 * Provides widget title, visualization type chips, X/Y axis column selectors,
 * and live `WidgetComponent` preview.
 */

import { Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { WidgetResponse } from '../../api-client';
import { WidgetComponent } from '../../widget/widget.component';
import { extractEventInputValue } from '../../shared/utils/dom-event.utils';

/**
 * Metadata describing a selectable visualization type option.
 */
export interface VisualizationOption {
  /** Visualization identifier (e.g. `'table'`, `'bar_chart'`). */
  id: string;
  /** Material icon name. */
  icon: string;
  /** Localized display label. */
  label: string;
}

/**
 * Visualization configuration and preview step inside `WidgetBuilderComponent`.
 */
@Component({
  selector: 'app-widget-builder-visualize-step',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    MatDividerModule,
    MatSelectModule,
    WidgetComponent,
  ],
  template: `
    <div class="h-full flex flex-col lg:flex-row overflow-hidden">
      <div
        class="w-full lg:w-80 border-r flex flex-col overflow-y-auto p-4 flex-shrink-0"
        style="background: var(--sys-surface-variant); border-color: var(--sys-surface-border)"
      >
        <h4 i18n class="text-xs font-bold uppercase mb-4" style="color: var(--sys-text-secondary)">
          Settings
        </h4>

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-4">
          <mat-label i18n>Widget Title</mat-label>
          <input matInput [value]="title()" (input)="titleChange.emit(getEventValue($event))" />
        </mat-form-field>

        <div i18n class="text-xs font-bold uppercase mb-2" style="color: var(--sys-text-secondary)">
          Visualization Type
        </div>
        <mat-chip-listbox
          class="mb-4 flex-col"
          [selectable]="true"
          i18n-aria-label
          aria-label="Visualization Type"
        >
          @for (viz of visualizations(); track viz.id) {
            <mat-chip-option
              [selected]="selectedVisualization() === viz.id"
              (click)="vizTypeChange.emit(viz.id)"
              (keydown.enter)="vizTypeChange.emit(viz.id)"
              (keydown.space)="vizTypeChange.emit(viz.id); $event.preventDefault()"
              class="w-full viz-option"
            >
              <mat-icon aria-hidden="true">{{ viz.icon }}</mat-icon> {{ viz.label }}
            </mat-chip-option>
          }
        </mat-chip-listbox>

        @if (showAxesConfig()) {
          <mat-divider class="mb-4"></mat-divider>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-2">
            @if (isPie()) {
              <mat-label i18n>Label Column</mat-label>
            } @else {
              <mat-label i18n>X-Axis / Category</mat-label>
            }
            <mat-select [value]="xKey()" (selectionChange)="xKeyChange.emit($event.value)">
              <mat-option i18n [value]="null">Auto</mat-option>
              @for (col of availableColumns(); track col) {
                <mat-option [value]="col">{{ col }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            @if (isPie()) {
              <mat-label i18n>Size Column</mat-label>
            } @else {
              <mat-label i18n>Y-Axis / Value</mat-label>
            }
            <mat-select [value]="yKey()" (selectionChange)="yKeyChange.emit($event.value)">
              <mat-option i18n [value]="null">Auto</mat-option>
              @for (col of availableColumns(); track col) {
                <mat-option [value]="col">{{ col }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </div>
      <div
        class="flex-grow flex flex-col p-8 overflow-hidden relative"
        style="background: var(--sys-background)"
      >
        <div
          class="rounded-lg shadow-sm border h-full w-full overflow-hidden flex flex-col p-4"
          style="background-color: var(--sys-surface); border-color: var(--sys-surface-border)"
        >
          @if (previewWidget(); as w) {
            <app-widget [widget]="w" class="flex-grow h-full w-full"></app-widget>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .viz-option {
        border: 1px solid var(--sys-surface-border);
        border-radius: 4px;
        padding: 8px;
        text-align: center;
        cursor: pointer;
        color: var(--sys-text-secondary);
        background-color: var(--sys-surface);
      }
      .viz-option:hover {
        background-color: var(--sys-hover);
      }
      .viz-option.selected {
        background-color: var(--sys-selected);
        color: var(--sys-primary);
        border-color: var(--sys-primary);
      }
    `,
  ],
})
export class WidgetBuilderVisualizeStepComponent {
  /** Current widget title string. */
  readonly title = input<string>('');
  /** Currently selected visualization identifier. */
  readonly selectedVisualization = input<string | undefined>(undefined);
  /** Available visualization options. */
  readonly visualizations = input<VisualizationOption[]>([]);
  /** Whether X and Y axis mapping selectors should be displayed. */
  readonly showAxesConfig = input<boolean>(false);
  /** Whether the selected visualization is a pie chart. */
  readonly isPie = input<boolean>(false);
  /** Available column names for axis mapping. */
  readonly availableColumns = input<string[]>([]);
  /** Currently selected X-axis column name. */
  readonly xKey = input<string | null>(null);
  /** Currently selected Y-axis column name. */
  readonly yKey = input<string | null>(null);
  /** Live preview widget snapshot. */
  readonly previewWidget = input<WidgetResponse | null>(null);

  /** Emits when the widget title input changes. */
  readonly titleChange = output<string>();
  /** Emits when a visualization option chip is selected. */
  readonly vizTypeChange = output<string>();
  /** Emits when the X-axis column selection changes. */
  readonly xKeyChange = output<string | null>();
  /** Emits when the Y-axis column selection changes. */
  readonly yKeyChange = output<string | null>();

  /**
   * Extracts the string value from a DOM input event.
   *
   * @param event - DOM input event from the title field.
   * @returns Extracted string value.
   */
  getEventValue(event: Event): string {
    return extractEventInputValue(event);
  }
}
