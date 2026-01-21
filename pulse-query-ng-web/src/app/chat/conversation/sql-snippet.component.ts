/**
 * @fileoverview Reusable SQL Code Block Component.
 *
 * Renders a readonly snippet of SQL with syntax highlighting (via Prism/Simple)
 * and an actionable "Run" button to open the query in the main Scratchpad.
 */

import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-sql-snippet',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; margin: 8px 0; max-width: 100%; }
    .card {
      border: 1px solid var(--sys-surface-border);
      border-radius: 8px;
      overflow: hidden;
      background-color: #282c34; /* Dark editor logic */
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
    /* Simple Syntax Highlighting Tokens (Matches dark theme) */
    .keyword { color: #c678dd; font-weight: bold; }
    .function { color: #61afef; }
    .string { color: #98c379; }
    .number { color: #d19a66; }
  `],
  template: `
    <div class="card">
      <div class="header">
        <span>Suggested Query</span>
        <div class="flex gap-2">
          <button mat-icon-button class="scale-75 text-gray-400 hover:text-white" (click)="copy()" aria-label="Copy SQL">
            <mat-icon style="font-size: 16px;">content_copy</mat-icon>
          </button>
          <button mat-stroked-button color="accent" class="text-xs h-6 px-2 leading-none" (click)="run.emit(sql())">
            <mat-icon class="mr-1 text-xs" style="font-size:14px; width:14px; height:14px;">play_arrow</mat-icon> Run
          </button>
        </div>
      </div>
      <div class="code-block" [innerHTML]="highlightedSql"></div>
    </div>
  `
})
export class SqlSnippetComponent {
  /** The SQL string to display. */
  readonly sql = input.required<string>();

  /** Event emitted when user clicks "Run". Payload is the SQL string. */
  readonly run = output<string>();

  /**
   * Computes simple HTML highlighting for basic SQL keywords.
   * Provides visual structure without a heavy library dependency.
   */
  get highlightedSql(): string {
    let code = this.sql() || '';
    // Escape HTML
    code = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Tokens
    code = code.replace(/\b(SELECT|FROM|WHERE|GROUP|BY|ORDER|LIMIT|JOIN|LEFT|RIGHT|inner|outer|ON|AND|OR|AS|WITH)\b/gi, '<span class="keyword">$1</span>');
    code = code.replace(/\b(count|sum|avg|max|min)\b/gi, '<span class="function">$1</span>');
    code = code.replace(/'([^']*)'/g, '<span class="string">\'$1\'</span>');
    code = code.replace(/\b(\d+)\b/g, '<span class="number">$1</span>');

    return code;
  }

  copy(): void {
    navigator.clipboard.writeText(this.sql());
  }
}