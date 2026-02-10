/**
 * @fileoverview Safe Markdown Renderer.
 * Allows displaying static text content with basic formatting.
 */

import { Component, input, computed, ChangeDetectionStrategy, SecurityContext, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Component to render markdown content safely.
 * Uses a lightweight regex parser to avoid external dependencies.
 */
@Component({
  selector: 'viz-markdown',
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
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
    /* Scoped Markdown Styles */
    .md-content ::ng-deep h1 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; border-bottom: 1px solid var(--sys-surface-border); padding-bottom: 4px; }
    .md-content ::ng-deep h2 { font-size: 1.25em; font-weight: bold; margin-bottom: 0.5em; }
    .md-content ::ng-deep h3 { font-size: 1.1em; font-weight: bold; margin-bottom: 0.5em; }
    .md-content ::ng-deep p { margin-bottom: 1em; }
    .md-content ::ng-deep ul { list-style-type: disc; padding-left: 20px; margin-bottom: 1em; }
    .md-content ::ng-deep ol { list-style-type: decimal; padding-left: 20px; margin-bottom: 1em; }
    .md-content ::ng-deep blockquote { border-left: 4px solid var(--sys-surface-border); padding-left: 12px; margin-left: 0; color: var(--sys-text-secondary); }
    .md-content ::ng-deep code { background-color: var(--sys-hover); padding: 2px 4px; border-radius: 4px; font-family: monospace; }
    .md-content ::ng-deep strong { font-weight: bold; }
    .md-content ::ng-deep em { font-style: italic; }
  `],
  template: `
    <div class="md-content" [innerHTML]="safeHtml()"></div>
  `
})
export class VizMarkdownComponent {
  readonly content = input<string>('');
  private readonly sanitizer = inject(DomSanitizer);

  readonly safeHtml = computed<SafeHtml>(() => {
    const raw = this.content() || '';
    const html = this.parseMarkdown(raw);
    // Sanitize to prevent XSS (removes scripts, etc.)
    return this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
  });

  /**
   * Lightweight Markdown Parser.
   * Supports: Headers (#), Bold (**), Italic (*), Lists (-), Blockquotes (>), Code (`).
   */
  private parseMarkdown(text: string): string {
    let md = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;'); // Escape HTML to prevent injection before parsing properties

    // Headers
    md = md.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    md = md.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    md = md.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Formatting
    md = md.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
    md = md.replace(/\*(.*)\*/gim, '<em>$1</em>');
    md = md.replace(/`(.*?)`/gim, '<code>$1</code>');

    // Lists (Unordered) - Simple logic assuming newline separation
    md = md.replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>');
    // Fix adjacent lists: </ul><ul> -> ''
    md = md.replace(/<\/ul>\s*<ul>/gim, '');

    // Blockquotes
    md = md.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Line breaks
    md = md.replace(/\n/gim, '<br>');

    return md;
  }
}
