/**
 * @fileoverview Sanitized Markdown rendering component for text widgets and AI assistant responses.
 */

import { Component, input, computed, SecurityContext, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Parses lightweight Markdown syntax into HTML and sanitizes the output via Angular's `DomSanitizer`.
 */
@Component({
  selector: 'viz-markdown',
  imports: [],

  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow: auto;
        padding: 16px;
        color: var(--sys-text-primary);
        font-size: 14px;
        line-height: 1.5;
      }
      .md-content {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
      }
      .md-table-wrapper {
        width: 100%;
        max-width: 100%;
        max-height: 360px;
        overflow: auto;
        margin: 8px 0;
        border: 1px solid var(--sys-surface-border, rgba(128, 128, 128, 0.25));
        border-radius: 6px;
      }
      .md-table {
        width: 100%;
        min-width: max-content;
        border-collapse: collapse;
        font-size: 13px;
      }
      .md-table th,
      .md-table td {
        padding: 6px 10px;
        text-align: left;
        border-bottom: 1px solid var(--sys-surface-border, rgba(128, 128, 128, 0.2));
        white-space: nowrap;
      }
      .md-table th {
        background: var(--sys-surface-variant, rgba(128, 128, 128, 0.1));
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        position: sticky;
        top: 0;
      }
    `,
  ],
  template: `<div class="md-content" [innerHTML]="safeHtml()"></div>`,
})
export class VizMarkdownComponent {
  /** Raw Markdown source text to render. */
  readonly content = input<string | null | undefined>('');
  /** Angular DOM sanitizer used to strip unsafe HTML tags and attributes. */
  private readonly sanitizer = inject(DomSanitizer);

  /** Computed sanitized HTML string ready for `[innerHTML]` binding. */
  readonly safeHtml = computed<SafeHtml>(() => {
    const raw = this.content() || '';
    const html = this.parseMarkdown(raw);
    return this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
  });

  /**
   * Converts basic Markdown formatting (headings, bold, italics, inline code, lists, blockquotes, and pipe tables) into HTML.
   *
   * Protects inline `` `code` `` spans before applying non-greedy bold (`**...**`) and italic (`*...*`)
   * formatting so SQL expressions like `` `SELECT * FROM t WHERE a * b > 1` `` are not corrupted.
   *
   * @param text - Raw Markdown string to convert.
   * @returns Unsanitized HTML string produced from the Markdown input.
   */
  private parseMarkdown(text: string): string {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const codeTokens: string[] = [];
    const withCodePlaceholders = escaped.replace(/`([^`\n]+?)`/g, (_match, codeBody: string) => {
      const idx = codeTokens.length;
      codeTokens.push(`<code>${codeBody}</code>`);
      return `\uE000CODE_${idx}\uE000`;
    });

    const withTables = this.convertMarkdownTables(withCodePlaceholders);
    let md = withTables.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    md = md.replace(/\*\*([^\n*]+?)\*\*/g, '<strong>$1</strong>');
    md = md.replace(/\*([^\n*]+?)\*/g, '<em>$1</em>');
    md = md.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>');
    md = md.replace(/<\/ul>\s*<ul>/gim, '');
    md = md.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    md = md.replace(/\n/gim, '<br>');
    return md.replace(/\uE000CODE_(\d+)\uE000/g, (_m, idxStr: string) => {
      return codeTokens[Number(idxStr)] as string;
    });
  }

  /**
   * Detects Markdown pipe tables (`| col1 | col2 |\n| --- | --- |\n| val1 | val2 |`)
   * and converts them into a responsive scrollable `<div class="md-table-wrapper"><table class="md-table">...</table></div>`.
   *
   * @param escapedText - HTML-escaped Markdown text.
   * @returns Markdown text with pipe tables replaced by single-line HTML table markup.
   */
  private convertMarkdownTables(escapedText: string): string {
    const lines = escapedText.split('\n');
    const out: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const rawLine = lines[i] as string;
      const currentLine = rawLine.trim();
      const nextLine = i + 1 < lines.length ? (lines[i + 1] as string).trim() : '';
      if (this.isTableRowLine(currentLine) && this.isTableSeparatorLine(nextLine)) {
        const headers = this.splitTableCells(currentLine);
        const bodyRows: string[][] = [];
        i += 2;
        while (i < lines.length && this.isTableRowLine((lines[i] as string).trim())) {
          bodyRows.push(this.splitTableCells((lines[i] as string).trim()));
          i++;
        }
        const thHtml = headers.map((h) => `<th>${h}</th>`).join('');
        const trsHtml = bodyRows
          .map(
            (row) => `<tr>${headers.map((_, idx) => `<td>${row[idx] ?? ''}</td>`).join('')}</tr>`,
          )
          .join('');
        out.push(
          `<div class="md-table-wrapper"><table class="md-table"><thead><tr>${thHtml}</tr></thead><tbody>${trsHtml}</tbody></table></div>`,
        );
      } else {
        out.push(rawLine);
        i++;
      }
    }

    return out.join('\n');
  }

  /**
   * Checks whether a trimmed line represents a Markdown pipe-delimited table row.
   *
   * @param line - Trimmed line string.
   * @returns True when the line starts and ends with `|` and has at least one cell.
   */
  private isTableRowLine(line: string): boolean {
    return line.startsWith('|') && line.endsWith('|') && line.length > 2;
  }

  /**
   * Checks whether a trimmed line represents a Markdown table separator row (`| --- | --- |`).
   *
   * @param line - Trimmed line string.
   * @returns True when every cell is a valid Markdown header separator (`---`, `:---`, `---:`, `:---:`).
   */
  private isTableSeparatorLine(line: string): boolean {
    if (!this.isTableRowLine(line)) {
      return false;
    }
    const cells = this.splitTableCells(line);
    return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
  }

  /**
   * Splits a pipe-delimited Markdown table row into trimmed cell strings, unescaping `\|`.
   *
   * @param line - Trimmed pipe-delimited row string.
   * @returns Array of cell text strings.
   */
  private splitTableCells(line: string): string[] {
    const inner = line.slice(1, -1);
    return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  }
}
