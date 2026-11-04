/**
 * @fileoverview Visualization configuration step subcomponent for `WidgetBuilderComponent`.
 *
 * Provides widget title, visualization type chips, X/Y axis column selectors,
 * SQL-to-visualization compatibility validation banners, and live `WidgetComponent` preview.
 */

import { Component, computed, input, model, output } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { WidgetResponse } from '../../api-client';
import { WidgetComponent } from '../../widget/widget.component';
import {
  ProcessorOption,
  SQL_NO_MODEL_OPTION,
} from '../../shared/services/processor-catalog.service';
import {
  CanonicalVisualizationType,
  formatVizLabel,
  VisualizationCompatibilityResult,
} from '../../shared/visualizations/viz-compatibility.utils';

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
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    MatDividerModule,
    MatSelectModule,
    MatSlideToggleModule,
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

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-3">
          <mat-label i18n>Widget Title</mat-label>
          <input matInput [formField]="titleField" />
        </mat-form-field>

        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-4">
          <mat-label i18n>Subtitle / Caption</mat-label>
          <input
            matInput
            data-testid="input-widget-subtitle"
            i18n-placeholder
            placeholder="Describe what this widget displays..."
            [formField]="subtitleField"
          />
        </mat-form-field>

        @if (previewWidget()?.type !== 'HTTP' && previewWidget()?.type !== 'TEXT') {
          <mat-divider class="mb-4"></mat-divider>
          <div class="mb-3">
            <mat-slide-toggle
              data-testid="toggle-allow-natural-text"
              [checked]="allowNaturalText()"
              (change)="allowNaturalText.set($event.checked)"
              i18n
            >
              Allow user natural text input
            </mat-slide-toggle>
          </div>

          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-3">
            <mat-label i18n>Query Processor (Model or SQL)</mat-label>
            <mat-select
              data-testid="select-widget-processor"
              [value]="selectedProcessor()"
              (selectionChange)="selectedProcessor.set($event.value)"
              i18n-aria-label
              aria-label="Select query processor model or SQL"
            >
              <mat-optgroup i18n-label label="Direct SQL">
                @for (opt of sqlOptions(); track opt.id) {
                  <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
                }
              </mat-optgroup>
              @if (ollamaOptions().length > 0) {
                <mat-optgroup i18n-label label="Ollama Models (Local)">
                  @for (opt of ollamaOptions(); track opt.id) {
                    <mat-option [value]="opt.id">{{ opt.name }}</mat-option>
                  }
                </mat-optgroup>
              }
              @if (anyLlmOptions().length > 0) {
                <mat-optgroup i18n-label label="Configured any-llm Models">
                  @for (opt of anyLlmOptions(); track opt.id) {
                    <mat-option [value]="opt.id">{{ opt.name }} ({{ opt.provider }})</mat-option>
                  }
                </mat-optgroup>
              }
            </mat-select>
          </mat-form-field>

          @if (allowNaturalText()) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-3">
              <mat-label i18n>Default Natural Text / SQL Prompt</mat-label>
              <input
                matInput
                data-testid="input-natural-text-prompt"
                [formField]="naturalTextPromptField"
              />
            </mat-form-field>
            <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-4">
              <mat-label i18n>Input Placeholder</mat-label>
              <input
                matInput
                data-testid="input-placeholder-text"
                [formField]="placeholderTextField"
              />
            </mat-form-field>
          }
        }

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
              (click)="selectVisualization(viz.id)"
              (keydown.enter)="selectVisualization(viz.id)"
              (keydown.space)="selectVisualization(viz.id); $event.preventDefault()"
              [attr.data-testid]="'viz-chip-' + viz.id"
              [attr.aria-selected]="selectedVisualization() === viz.id"
              class="w-full viz-option"
            >
              <mat-icon aria-hidden="true">{{ viz.icon }}</mat-icon> {{ viz.label }}
            </mat-chip-option>
          }
        </mat-chip-listbox>

        @if (vizCompatibility(); as compat) {
          @if (!compat.compatible) {
            <div
              class="p-3 rounded border mb-4 text-xs"
              style="
                background-color: var(--sys-error-container);
                color: var(--sys-on-error-container);
                border-color: var(--sys-error);
              "
              role="alert"
              data-testid="builder-viz-validation-error"
            >
              <div class="font-semibold mb-1" i18n>Incompatible Visualization</div>
              <div class="mb-2">{{ compat.reason }}</div>
              @if (compat.suggestedVisualizations.length > 0) {
                <div class="flex flex-wrap gap-1">
                  @for (sug of compat.suggestedVisualizations; track sug) {
                    <button
                      type="button"
                      mat-stroked-button
                      class="text-xs"
                      [attr.data-testid]="'builder-btn-suggest-viz-' + sug"
                      (click)="selectVisualization(sug)"
                    >
                      {{ formatSuggestedViz(sug) }}
                    </button>
                  }
                </div>
              }
            </div>
          } @else if (compat.warnings.length > 0) {
            <div
              class="p-3 rounded border mb-4 text-xs"
              style="
                background-color: var(--sys-surface);
                color: var(--sys-text-secondary);
                border-color: var(--sys-surface-border);
              "
              role="status"
              data-testid="builder-viz-validation-warning"
            >
              @for (w of compat.warnings; track w.code) {
                <div>{{ w.message }}</div>
              }
            </div>
          }
        }

        @if (showAxesConfig()) {
          <mat-divider class="mb-4"></mat-divider>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-2">
            @if (isPie()) {
              <mat-label i18n>Label Column</mat-label>
            } @else {
              <mat-label i18n>X-Axis / Category</mat-label>
            }
            <mat-select [value]="xKey()" (selectionChange)="xKey.set($event.value)">
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
            <mat-select [value]="yKey()" (selectionChange)="yKey.set($event.value)">
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
          role="status"
          aria-live="polite"
        >
          @if (previewWidget(); as w) {
            <app-widget
              [widget]="w"
              [dataOverride]="previewData()"
              class="flex-grow h-full w-full"
            ></app-widget>
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
  /** Current widget title string (two-way bound). */
  readonly title = model<string>('');
  /** Current widget subtitle or caption string (two-way bound). */
  readonly subtitle = model<string>('');
  /** Currently selected visualization identifier (two-way bound). */
  readonly selectedVisualization = model<string | null | undefined>(undefined);
  /** Available visualization options. */
  readonly visualizations = input<VisualizationOption[]>([]);
  /** Whether X and Y axis mapping selectors should be displayed. */
  readonly showAxesConfig = input<boolean>(false);
  /** Whether the selected visualization is a pie chart. */
  readonly isPie = input<boolean>(false);
  /** Available column names for axis mapping. */
  readonly availableColumns = input<string[]>([]);
  /** Currently selected X-axis column name (two-way bound). */
  readonly xKey = model<string | null>(null);
  /** Currently selected Y-axis column name (two-way bound). */
  readonly yKey = model<string | null>(null);
  /** Live preview widget snapshot. */
  readonly previewWidget = input<WidgetResponse | null>(null);
  /** Optional preview execution result passed to `<app-widget [dataOverride]>`. */
  readonly previewData = input<unknown>(undefined);
  /** Optional SQL-to-visualization compatibility evaluation result. */
  readonly vizCompatibility = input<VisualizationCompatibilityResult | null>(null);
  /** Whether the widget allows user natural text input on the dashboard (two-way bound). */
  readonly allowNaturalText = model<boolean>(false);
  /** Selected processor ID (`'SQL'`, `'ollama:<model>'`, or `'<provider>:<model>'`) (two-way bound). */
  readonly selectedProcessor = model<string>('SQL');
  /** Default natural text prompt string (two-way bound). */
  readonly naturalTextPrompt = model<string>('');
  /** Optional custom placeholder text for the widget natural text input (two-way bound). */
  readonly placeholderText = model<string>('');
  /** Signal Form field bound to `title`. */
  readonly titleField = form(this.title);
  /** Signal Form field bound to `subtitle`. */
  readonly subtitleField = form(this.subtitle);
  /** Signal Form field bound to `naturalTextPrompt`. */
  readonly naturalTextPromptField = form(this.naturalTextPrompt);
  /** Signal Form field bound to `placeholderText`. */
  readonly placeholderTextField = form(this.placeholderText);
  /** Available processor options (`SQL [no model]`, Ollama models, `any-llm` models). */
  readonly processors = input<ProcessorOption[]>([SQL_NO_MODEL_OPTION]);

  /** Computed list of SQL [no model] processor options. */
  readonly sqlOptions = computed(() => {
    const sqls = this.processors().filter((p) => p.category === 'SQL');
    return sqls.length > 0 ? sqls : [SQL_NO_MODEL_OPTION];
  });

  /** Computed list of Ollama processor options. */
  readonly ollamaOptions = computed(() => this.processors().filter((p) => p.category === 'OLLAMA'));

  /** Computed list of Mozilla `any-llm` processor options. */
  readonly anyLlmOptions = computed(() =>
    this.processors().filter((p) => p.category === 'ANY_LLM'),
  );

  /** Emits when a visualization option chip is selected. */
  readonly vizTypeChange = output<string>();
  /** Emits when the selected processor changes. */
  readonly processorChange = output<string>();

  /**
   * Updates `selectedVisualization` and emits `vizTypeChange`.
   *
   * @param vizId - Selected visualization identifier.
   */
  selectVisualization(vizId: string): void {
    this.selectedVisualization.set(vizId);
    this.vizTypeChange.emit(vizId);
  }

  /**
   * Formats a suggested canonical visualization identifier into a localized label.
   *
   * @param viz - Canonical visualization identifier.
   * @returns Localized display label.
   */
  formatSuggestedViz(viz: CanonicalVisualizationType): string {
    return formatVizLabel(viz);
  }
}
