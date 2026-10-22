/**
 * @fileoverview Focus Trap Directive.
 * Traps keyboard focus within a container for modal dialogs and overlays.
 * Ensures WCAG 2.1 AA compliance for keyboard navigation.
 */

import { Directive, ElementRef, inject, OnInit, OnDestroy, input, output } from '@angular/core';
import { DOCUMENT } from '@angular/common';

/**
 * Focus Trap Directive.
 *
 * Automatically traps focus within the host element, cycling through
 * focusable elements with Tab/Shift+Tab. Useful for modals and dialogs.
 *
 * @example
 * ```html
 * <div appFocusTrap [autoFocus]="true" (escape)="closeDialog()">
 *   <button>First</button>
 *   <input />
 *   <button>Last</button>
 * </div>
 * ```
 */
@Directive({
  selector: '[appFocusTrap]',
  host: {
    '(keydown)': 'handleKeydown($event)',
  },
})
export class FocusTrapDirective implements OnInit, OnDestroy {
  /** Element ref. */
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Injected DOM document reference. */
  private readonly document = inject(DOCUMENT);

  /**
   * Whether to automatically focus the first focusable element on init.
   */
  readonly autoFocus = input(true);

  /**
   * Emits when the Escape key is pressed.
   */
  readonly escape = output<void>();

  /** Previous active element. */
  private previousActiveElement: HTMLElement | null = null;

  /**
   * Lifecycle hook: Initialize focus trap.
   */
  ngOnInit(): void {
    this.previousActiveElement = this.document.activeElement as HTMLElement;

    if (this.autoFocus()) {
      this.focusFirstElement();
    }
  }

  /**
   * Lifecycle hook: Cleanup and restore focus.
   */
  ngOnDestroy(): void {
    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
  }

  /**
   * Handles keydown events for focus trapping.
   *
   * @param event - The keyboard event.
   */
  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.escape.emit();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = this.getFocusableElements();
    const [firstElement] = focusableElements;
    if (!firstElement) {
      return;
    }

    const lastElement = focusableElements.reduce((_, el) => el, firstElement);
    const activeElement = this.document.activeElement;

    if (event.shiftKey) {
      // Shift + Tab: Move focus backward
      if (activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab: Move focus forward
      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }

  /**
   * Focuses the first focusable element within the container.
   */
  private focusFirstElement(): void {
    const [firstElement] = this.getFocusableElements();

    if (firstElement) {
      firstElement.focus();
    }
  }

  /**
   * Gets all focusable elements within the container.
   *
   * @returns Array of focusable HTML elements.
   */
  private getFocusableElements(): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const nodes = this.elementRef.nativeElement.querySelectorAll(selector);
    const view = this.document.defaultView;
    return Array.from(nodes as NodeListOf<HTMLElement>).filter((el: HTMLElement) => {
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        !el.hasAttribute('hidden') &&
        view?.getComputedStyle(el).visibility !== 'hidden'
      );
    });
  }
}
