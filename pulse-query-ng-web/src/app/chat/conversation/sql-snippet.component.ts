/**
 * @fileoverview Syntax-highlighted SQL code block component with actions to run,
 * copy, simulate, or save the query to the cart.
 */
import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Displays a formatted and syntax-highlighted SQL snippet with quick action buttons.
 */
@Component({
  selector: 'app-sql-snippet',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],

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
      .comment {
        color: #9da5b4;
        font-style: italic;
      }
    `,
  ],
  templateUrl: './sql-snippet.component.html',
})
export class SqlSnippetComponent {
  /** Raw SQL query string to display and highlight. */
  readonly sql = input<string | null | undefined>('');
  /** Emits the SQL string when the user clicks the Run action. */
  readonly run = output<string>();
  /** Emits the SQL string when the user adds the query to the cart. */
  readonly addToCart = output<string>();
  /** Emits the SQL string when the user launches the simulation view. */
  readonly simulate = output<string>();

  /** Computed signal returning HTML-escaped SQL string with syntax highlighting span tags. */
  readonly highlightedSql = computed((): string => {
    const raw = this.sql() || '';
    if (!raw) return '';
    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tokenPattern =
      /(--[^\n]*)|('[^']*')|\b(\d+(?:\.\d+)?)\b|\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|OFFSET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|AS|WITH|CASE|WHEN|THEN|ELSE|END|DISTINCT|HAVING|UNION|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|VIEW|INDEX|EXPLAIN|PRAGMA)\b|\b(count|sum|avg|max|min|coalesce|round|cast|date_trunc|to_char|now)\b/gi;

    return escaped.replace(
      tokenPattern,
      (
        match: string,
        comment?: string,
        strLit?: string,
        numLit?: string,
        keyword?: string,
      ): string => {
        if (comment !== undefined) return `<span class="comment">${comment}</span>`;
        if (strLit !== undefined) return `<span class="string">${strLit}</span>`;
        if (numLit !== undefined) return `<span class="number">${numLit}</span>`;
        if (keyword !== undefined) return `<span class="keyword">${keyword}</span>`;
        return `<span class="function">${match}</span>`;
      },
    );
  });

  /** Emits the `run` output event if a SQL snippet is present. */
  emitRun(): void {
    const val = this.sql();
    if (val) this.run.emit(val);
  }

  /** Emits the `addToCart` output event if a SQL snippet is present. */
  emitAddToCart(): void {
    const val = this.sql();
    if (val) this.addToCart.emit(val);
  }

  /** Emits the `simulate` output event if a SQL snippet is present. */
  emitSimulate(): void {
    const val = this.sql();
    if (val) this.simulate.emit(val);
  }

  /** Copies the raw SQL string to the system clipboard. */
  copy(): void {
    const val = this.sql();
    if (val) navigator.clipboard.writeText(val);
  }
}
