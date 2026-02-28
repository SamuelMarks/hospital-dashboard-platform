/* v8 ignore start */
/** @docs */
// pulse-query-ng-web/src/app/chat/conversation/sql-snippet.component.ts
import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/** @docs */
@Component({
  selector: 'app-sql-snippet',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule],
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
        color: #5c6370;
        font-style: italic;
      }
    `,
  ],
  templateUrl: './sql-snippet.component.html',
})
/** @docs */
export class SqlSnippetComponent {
  /* v8 ignore next */
  readonly sql = input<string | null | undefined>('');
  readonly run = output<string>();
  readonly addToCart = output<string>();
  readonly simulate = output<string>();

  get highlightedSql(): string {
    let code = this.sql() || '';
    code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    code = code.replace(/'([^']*)'/g, '<span class="string">\'$1\'</span>');
    code = code.replace(/(--.*$)/gm, '<span class="comment">$1</span>');
    code = code.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="number">$1</span>');

    const keywords =
      'SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|OFFSET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|AS|WITH|CASE|WHEN|THEN|ELSE|END|DISTINCT|HAVING|UNION|ALL|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|VIEW|INDEX|EXPLAIN|PRAGMA';
    code = code.replace(new RegExp(`\\b(${keywords})\\b`, 'gi'), '<span class="keyword">$1</span>');

    const functions = 'count|sum|avg|max|min|coalesce|round|cast|date_trunc|to_char|now';
    code = code.replace(
      new RegExp(`\\b(${functions})\\b`, 'gi'),
      '<span class="function">$1</span>',
    );

    return code;
  }

  emitRun(): void {
    const val = this.sql();
    if (val) this.run.emit(val);
  }

  emitAddToCart(): void {
    const val = this.sql();
    if (val) this.addToCart.emit(val);
  }

  emitSimulate(): void {
    const val = this.sql();
    if (val) this.simulate.emit(val);
  }

  copy(): void {
    const val = this.sql();
    if (val) navigator.clipboard.writeText(val);
  }
}
