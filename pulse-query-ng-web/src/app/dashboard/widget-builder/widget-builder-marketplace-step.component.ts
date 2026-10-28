/**
 * @fileoverview Marketplace template selection step subcomponent for `WidgetBuilderComponent`.
 *
 * Renders the search box, category filter chips, loading spinner, and accessible
 * marketplace template card grid.
 */

import { Component, input, output } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { TemplateResponse } from '../../api-client';

/**
 * Marketplace template browser step inside `WidgetBuilderComponent`.
 */
@Component({
  selector: 'app-widget-builder-marketplace-step',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="p-6 h-full overflow-y-auto">
      <div class="flex gap-4 mb-4 items-center flex-wrap">
        <mat-form-field
          appearance="outline"
          density="compact"
          subscriptSizing="dynamic"
          class="w-64"
        >
          <mat-icon aria-hidden="true" matPrefix>search</mat-icon>
          <input
            matInput
            i18n-aria-label
            aria-label="Search templates"
            i18n-placeholder
            placeholder="Search templates..."
            (input)="searchInput.emit($event)"
          />
        </mat-form-field>
        <mat-chip-listbox i18n-aria-label aria-label="Template categories">
          @for (cat of categories(); track cat) {
            <mat-chip-option
              [selected]="selectedCategory() === cat"
              (selectionChange)="categoryToggle.emit(cat)"
              >{{ cat }}</mat-chip-option
            >
          }
        </mat-chip-listbox>
      </div>

      @if (loadingTemplates()) {
        <div class="flex justify-center p-12">
          <mat-spinner
            diameter="40"
            i18n-aria-label
            aria-label="Loading marketplace templates"
          ></mat-spinner>
        </div>
      }

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="list">
        @for (t of templates(); track t.id) {
          <div role="listitem">
            <div
              class="template-card h-full"
              [class.selected]="selectedTemplateId() === t.id"
              (click)="templateSelect.emit(t)"
              (keydown.enter)="templateSelect.emit(t)"
              (keydown.space)="templateSelect.emit(t); $event.preventDefault()"
              tabindex="0"
              role="button"
              [attr.aria-pressed]="selectedTemplateId() === t.id"
              [attr.aria-label]="getTemplateAriaLabel(t)"
            >
              <div class="font-medium text-primary mb-1" style="color: var(--sys-primary)">
                {{ t.title }}
              </div>
              <div
                class="text-xs uppercase tracking-wider mb-2"
                style="color: var(--sys-text-secondary)"
              >
                {{ t.category }}
              </div>
              <div class="text-sm line-clamp-3" style="color: var(--sys-on-surface-variant)">
                {{ t.description }}
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .template-card {
        border: 1px solid var(--sys-surface-border);
        background-color: var(--sys-surface);
        border-radius: 8px;
        padding: 16px;
        cursor: pointer;
        transition: all 0.2s;
        outline: none;
        color: var(--sys-text-primary);
      }
      .template-card:hover {
        background-color: var(--sys-hover);
        border-color: var(--sys-primary);
        transform: translateY(-2px);
      }
      .template-card:focus-visible {
        outline: 2px solid var(--sys-primary);
        outline-offset: 2px;
      }
      .template-card.selected {
        background-color: var(--sys-selected);
        border-color: var(--sys-primary);
        box-shadow: 0 0 0 1px var(--sys-primary);
      }
    `,
  ],
})
export class WidgetBuilderMarketplaceStepComponent {
  /** Available category filter labels. */
  readonly categories = input<string[]>([]);
  /** Currently active category filter, or `null` when unfiltered. */
  readonly selectedCategory = input<string | null>(null);
  /** Whether templates are currently loading. */
  readonly loadingTemplates = input<boolean>(false);
  /** Loaded marketplace template records. */
  readonly templates = input<TemplateResponse[]>([]);
  /** Currently selected template ID. */
  readonly selectedTemplateId = input<string | undefined>(undefined);

  /** Emits the DOM input event when the search field changes. */
  readonly searchInput = output<Event>();
  /** Emits the category name when a category chip is toggled. */
  readonly categoryToggle = output<string>();
  /** Emits the chosen template when a template card is activated. */
  readonly templateSelect = output<TemplateResponse>();

  /**
   * Returns a localized accessible label for a template card.
   *
   * @param t - The template response object.
   * @returns Localized ARIA label string.
   */
  getTemplateAriaLabel(t: TemplateResponse): string {
    return $localize`Select template: ${t.title}`;
  }
}
