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
