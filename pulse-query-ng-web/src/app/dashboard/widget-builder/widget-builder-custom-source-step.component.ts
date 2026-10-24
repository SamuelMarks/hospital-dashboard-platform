/**
 * @fileoverview Custom data source selection step subcomponent for `WidgetBuilderComponent`.
 *
 * Displays the three custom widget data source options (SQL Database, HTTP API,
 * and Static Markdown) with full keyboard and ARIA button semantics.
 */

import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Custom data source selector step inside `WidgetBuilderComponent`.
 */
@Component({
  selector: 'app-widget-builder-custom-source-step',
  imports: [MatIconModule],
  template: `
    <div class="p-8 max-w-4xl mx-auto h-full flex flex-col justify-center">
      <h3 i18n class="text-lg font-medium mb-6 text-center" style="color: var(--sys-text-primary)">
        Choose Data Source
      </h3>
      <div class="grid grid-cols-3 gap-6">
        <!-- SQL -->
        <div
          class="source-option"
          [class.selected]="selectedCustomType() === 'SQL'"
          (click)="customTypeSelect.emit('SQL')"
          tabindex="0"
          role="button"
          [attr.aria-pressed]="selectedCustomType() === 'SQL'"
          (keydown.enter)="customTypeSelect.emit('SQL')"
          (keydown.space)="customTypeSelect.emit('SQL'); $event.preventDefault()"
        >
          <mat-icon aria-hidden="true" class="text-4xl mb-4" style="color: var(--sys-primary)"
            >storage</mat-icon
          >
          <div i18n class="font-bold">SQL Database</div>
          <div i18n class="text-sm mt-2 text-center" style="color: var(--sys-text-secondary)">
            Query the internal DuckDB analytics engine using SQL
          </div>
        </div>
        <!-- HTTP -->
        <div
          class="source-option"
          [class.selected]="selectedCustomType() === 'HTTP'"
          (click)="customTypeSelect.emit('HTTP')"
          tabindex="0"
          role="button"
          [attr.aria-pressed]="selectedCustomType() === 'HTTP'"
          (keydown.enter)="customTypeSelect.emit('HTTP')"
          (keydown.space)="customTypeSelect.emit('HTTP'); $event.preventDefault()"
        >
          <mat-icon aria-hidden="true" class="text-4xl mb-4" style="color: var(--sys-tertiary)"
            >cloud_download</mat-icon
          >
          <div i18n class="font-bold">HTTP API</div>
          <div i18n class="text-sm mt-2 text-center" style="color: var(--sys-text-secondary)">
            Fetch JSON data from an external REST endpoint
          </div>
        </div>
        <!-- TEXT -->
        <div
          class="source-option"
          [class.selected]="selectedCustomType() === 'TEXT'"
          (click)="customTypeSelect.emit('TEXT')"
          tabindex="0"
          role="button"
          [attr.aria-pressed]="selectedCustomType() === 'TEXT'"
          (keydown.enter)="customTypeSelect.emit('TEXT')"
          (keydown.space)="customTypeSelect.emit('TEXT'); $event.preventDefault()"
        >
          <mat-icon aria-hidden="true" class="text-4xl mb-4" style="color: var(--sys-secondary)"
            >description</mat-icon
          >
          <div i18n class="font-bold">Static Markdown</div>
          <div i18n class="text-sm mt-2 text-center" style="color: var(--sys-text-secondary)">
            Add text descriptions, instructions, or notes.
          </div>
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
      .source-option {
        border: 1px solid var(--sys-surface-border);
        border-radius: 12px;
        padding: 32px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        background-color: var(--sys-surface);
        color: var(--sys-text-primary);
      }
      .source-option:hover {
        background-color: var(--sys-hover);
        border-color: var(--sys-primary);
      }
      .source-option.selected {
        background-color: var(--sys-selected);
        border-color: var(--sys-primary);
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
    `,
  ],
})
export class WidgetBuilderCustomSourceStepComponent {
  /** Currently selected custom data source type, or `null` when none is selected. */
  readonly selectedCustomType = input<'SQL' | 'HTTP' | 'TEXT' | null>(null);
  /** Emits the chosen custom data source type (`'SQL'`, `'HTTP'`, or `'TEXT'`). */
  readonly customTypeSelect = output<'SQL' | 'HTTP' | 'TEXT'>();
}
