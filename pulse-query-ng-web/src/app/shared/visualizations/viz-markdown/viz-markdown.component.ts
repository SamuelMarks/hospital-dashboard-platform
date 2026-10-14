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
        overflow-y: auto;
        padding: 16px;
        color: var(--sys-text-primary);
        font-size: 14px;
        line-height: 1.5;
      }
      .md-content ::ng-deep h1 {
        font-size: 1.5em;
        font-weight: bold;
        margin-bottom: 0.5em;
        border-bottom: 1px solid var(--sys-surface-border);
        padding-bottom: 4px;
      }
      .md-content ::ng-deep h2 {
        font-size: 1.25em;
        font-weight: bold;
        margin-bottom: 0.5em;
      }
      .md-content ::ng-deep h3 {
        font-size: 1.1em;
        font-weight: bold;
        margin-bottom: 0.5em;
      }
      .md-content ::ng-deep p {
        margin-bottom: 1em;
      }
      .md-content ::ng-deep ul {
        list-style-type: disc;
        padding-left: 20px;
        margin-bottom: 1em;
      }
      .md-content ::ng-deep ol {
        list-style-type: decimal;
        padding-left: 20px;
        margin-bottom: 1em;
      }
      .md-content ::ng-deep blockquote {
        border-left: 4px solid var(--sys-surface-border);
        padding-left: 12px;
        margin-left: 0;
        color: var(--sys-text-secondary);
      }
      .md-content ::ng-deep code {
        background-color: var(--sys-hover);
        padding: 2px 4px;
        border-radius: 4px;
        font-family: monospace;
      }
      .md-content ::ng-deep strong {
        font-weight: bold;
      }
      .md-content ::ng-deep em {
        font-style: italic;
      }
    `,
  ],
  templateUrl: './viz-markdown.component.html',
})
export class VizMarkdownComponent {
  /** Raw Markdown source text to render. */
  readonly content = input<string>('');
  /** Angular DOM sanitizer used to strip unsafe HTML tags and attributes. */
  private readonly sanitizer = inject(DomSanitizer);

  /** Computed sanitized HTML string ready for `[innerHTML]` binding. */
  readonly safeHtml = computed<SafeHtml>(() => {
    const raw = this.content() || '';
    const html = this.parseMarkdown(raw);
    return this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
  });

  /**
   * Converts basic Markdown formatting (headings, bold, italics, inline code, lists, blockquotes) into HTML.
   *
   * @param text - Raw Markdown string to convert.
   * @returns Unsanitized HTML string produced from the Markdown input.
   */
  private parseMarkdown(text: string): string {
    let md = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    md = md.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    md = md.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
    md = md.replace(/\*(.*)\*/gim, '<em>$1</em>');
    md = md.replace(/`(.*?)`/gim, '<code>$1</code>');
    md = md.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>');
    md = md.replace(/<\/ul>\s*<ul>/gim, '');
    md = md.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
    md = md.replace(/\n/gim, '<br>');
    return md;
  }
}
