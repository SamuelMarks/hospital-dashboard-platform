/**
 * @fileoverview Preview step subcomponent for `TemplateWizardComponent`.
 *
 * Displays the syntax-highlighted interpolated SQL query, loading spinner,
 * and tabular preview results or error messages.
 */

import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  VizTableComponent,
  TableDataSet,
} from '../../shared/visualizations/viz-table/viz-table.component';

/**
 * Result payload for a stateless SQL preview execution in the template wizard.
 */
export interface TemplatePreviewExecutionResult {
  /** Optional error message returned when SQL preview execution fails. */
  error?: string | null;
  /** Column names returned by the SQL preview query. */
  columns?: string[];
  /** Result rows returned by the SQL preview query. */
  data?: Record<string, unknown>[];
}

/**
 * Renders the SQL query preview and tabular result preview step inside `TemplateWizardComponent`.
 */
@Component({
  selector: 'app-template-wizard-preview-step',
  imports: [MatIconModule, MatProgressSpinnerModule, VizTableComponent],
  template: `
    <div
      class="step-content pt-4 h-full flex flex-col"
      style="background-color: var(--sys-background)"
    >
      <div class="flex flex-col gap-2 mb-4">
        <label
          i18n
          for="wizard-generated-sql"
          class="text-sm font-bold"
          style="color: var(--sys-text-primary)"
          >Generated Query</label
        >
        <div
          class="editor-wrapper shadow-inner h-48 border rounded overflow-hidden relative"
          style="border-color: var(--sys-surface-border)"
        >
          <div class="highlight-layer absolute inset-0 p-4" [innerHTML]="highlightedSql()"></div>
          <textarea
            id="wizard-generated-sql"
            class="raw-input absolute inset-0 w-full h-full p-4"
            readonly
            [value]="finalSql()"
            (scroll)="syncScroll($event)"
            i18n-aria-label
            aria-label="Generated SQL query preview"
          ></textarea>
        </div>
      </div>

      <div
        class="results-container relative flex-grow border rounded overflow-hidden"
        style="
          min-height: 250px;
          background-color: var(--sys-surface);
          border-color: var(--sys-surface-border);
        "
      >
        @if (isRunning()) {
          <div
            class="absolute inset-0 z-10 flex items-center justify-center"
            style="background-color: color-mix(in srgb, var(--sys-surface) 80%, transparent)"
          >
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        }

        @if (executionResult(); as res) {
          @if (res.error) {
            <div
              role="alert"
              class="p-4 flex items-center justify-center"
              style="color: var(--sys-error)"
            >
              <mat-icon aria-hidden="true">error</mat-icon> {{ res.error }}
            </div>
          } @else {
            <viz-table [dataSet]="asTableData(res)" class="h-full block w-full"></viz-table>
          }
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
      .editor-wrapper {
        position: relative;
        background: #1e1e1e;
        color: #d4d4d4;
        font-family: 'Consolas', monospace;
        font-size: 14px;
        overflow: hidden;
      }
      textarea.raw-input {
        position: absolute;
        inset: 0;
        padding: 12px;
        background: transparent;
        color: transparent;
        caret-color: white;
        border: none;
        resize: none;
        z-index: 2;
      }
      .highlight-layer {
        position: absolute;
        inset: 0;
        padding: 12px;
        z-index: 1;
        pointer-events: none;
      }
    `,
  ],
})
export class TemplateWizardPreviewStepComponent {
  /** DOM sanitizer for rendering syntax-highlighted SQL HTML. */
  private readonly sanitizer = inject(DomSanitizer);

  /** Interpolated SQL query string ready for preview and saving. */
  readonly finalSql = input<string>('');

  /** Whether a preview query or widget creation call is currently running. */
  readonly isRunning = input<boolean>(false);

  /** Latest stateless SQL preview result or error message. */
  readonly executionResult = input<TemplatePreviewExecutionResult | null>(null);

  /**
   * Computed signal producing syntax-highlighted HTML for the preview SQL query.
   */
  readonly highlightedSql = computed((): SafeHtml => {
    let code = this.finalSql() || '';
    code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const keywords =
      /\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|JOIN|LEFT|RIGHT|INNER|ON|AND|OR|AS)\b/gi;
    code = code.replace(keywords, '<span class="kwd">$1</span>');
    code = code.replace(/'([^']*)'/g, `<span class="str">'$1'</span>`);
    code = code.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
    return this.sanitizer.bypassSecurityTrustHtml(code + '<br>');
  });

  /**
   * Synchronizes scroll offsets between the transparent textarea and the syntax-highlight layer.
   *
   * @param e - DOM scroll event from the SQL textarea.
   */
  syncScroll(e: Event): void {
    const target = e.target as HTMLTextAreaElement;
    const highlight = target.parentElement?.querySelector('.highlight-layer');
    if (highlight) {
      highlight.scrollTop = target.scrollTop;
      highlight.scrollLeft = target.scrollLeft;
    }
  }

  /**
   * Converts the preview execution result into a `TableDataSet` for `VizTableComponent`.
   *
   * @param res - Raw execution result object.
   * @returns Typed `TableDataSet` for tabular rendering.
   */
  asTableData(res: TemplatePreviewExecutionResult): TableDataSet {
    return {
      columns: res.columns ?? [],
      data: res.data ?? [],
    };
  }
}
