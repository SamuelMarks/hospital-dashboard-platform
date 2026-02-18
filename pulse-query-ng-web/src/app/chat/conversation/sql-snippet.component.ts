/**
 * @fileoverview Reusable SQL Code Block Component.
 *
 * Renders a readonly snippet of SQL with syntax highlighting (via simple regex)
 * and an actionable "Run" button to open the query in the main Scratchpad.
 * Designed to look like a dark-mode editor by default, preserving readability
 * in both Light/Dark app modes.
 */

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Sql Snippet component. */
@Component({
  selector: 'app-sql-snippet',
  imports: [CommonModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        margin: 8px 0;
        max-width: 100%;
      }
      .card {
        border: 1px solid var(--sys-surface-border);
        border-radius: 8px;
        overflow: hidden;
        /* Force dark background for code readability regardless of theme */
        background-color: #282c34;
        color: #abb2bf;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 12px;
        background-color: #21252b;
        font-size: 11px;
        text-transform: uppercase;
        font-family: monospace;
        color: #9da5b4;
      }
      .code-block {
        padding: 12px;
        font-family: 'Consolas', monospace;
        font-size: 13px;
        white-space: pre-wrap;
        word-break: break-word;
        line-height: 1.5;
        overflow-x: auto;
      }
      /* Simple Syntax Highlighting Tokens (Matches One Dark theme) */
      .keyword {
        color: #c678dd;
        font-weight: bold;
      }
      .function {
        color: #61afef;
      }
      .string {
        color: #98c379;
      }
      .number {
        color: #d19a66;
      }
    `,
  ],
  templateUrl: './sql-snippet.component.html',
})
export class SqlSnippetComponent {
  /**
   * The SQL string to display and highlight.
   */
  /* istanbul ignore next */
  readonly sql = input<string | null | undefined>('');

  /**
   * Event emitted when user clicks "Run". Payload is the SQL string.
   */
  readonly run = output<string>();

  /**
   * Computes simple HTML highlighting for basic SQL keywords.
   * Provides visual structure without a heavy library dependency.
   *
   * @returns {string} Safe HTML string with span tags for coloring.
   */
  get highlightedSql(): string {
    let code = this.sql() || '';
    // Escape HTML to prevention injection
    code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Token Replace
    code = code.replace(
      /\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|JOIN|LEFT|RIGHT|inner|outer|ON|AND|OR|AS|WITH)\b/gi,
      '<span class="keyword">$1</span>',
    );
    code = code.replace(/\b(count|sum|avg|max|min)\b/gi, '<span class="function">$1</span>');
    code = code.replace(/'([^']*)'/g, '<span class="string">\'$1\'</span>');
    code = code.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');

    return code;
  }

  /**
   * Safe emission handler for the template.
   */
  emitRun(): void {
    const val = this.sql();
    if (val) {
      this.run.emit(val);
    }
  }

  /**
   * Copies the raw SQL to the system clipboard.
   */
  copy(): void {
    const val = this.sql();
    if (val) {
      navigator.clipboard.writeText(val);
    }
  }
}
