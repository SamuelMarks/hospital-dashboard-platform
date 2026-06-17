/** @docs */
/**
 * @fileoverview Focus Trap Directive.
 * Traps keyboard focus within a container for modal dialogs and overlays.
 * Ensures WCAG 2.1 AA compliance for keyboard navigation.
 */

import { Directive, ElementRef, inject, OnInit, OnDestroy, input, output } from '@angular/core';

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
})
export class FocusTrapDirective implements OnInit, OnDestroy {
  /** Element ref. */ private readonly elementRef = inject(ElementRef<HTMLElement>);

  /* v8 ignore start */
  /**
   * Whether to automatically focus the first focusable element on init.
   */
  readonly autoFocus = input<boolean>(true);

  /**
   * Emits when the Escape key is pressed.
   */
  readonly escape = output<void>();
  /* v8 ignore stop */

  /** Previous active element. */ private previousActiveElement: HTMLElement | null = null;
  /** Bound keydown handler. */ private boundKeydownHandler = this.handleKeydown.bind(this);

  /**
   * Lifecycle hook: Initialize focus trap.
   */
  ngOnInit(): void {
    this.previousActiveElement = document.activeElement as HTMLElement;

    /* v8 ignore next 3 */
    if (this.autoFocus()) {
      this.focusFirstElement();
    }

    this.elementRef.nativeElement.addEventListener('keydown', this.boundKeydownHandler);
  }

  /**
   * Lifecycle hook: Cleanup and restore focus.
   */
  ngOnDestroy(): void {
    this.elementRef.nativeElement.removeEventListener('keydown', this.boundKeydownHandler);

    if (this.previousActiveElement) {
      this.previousActiveElement.focus();
    }
  }

  /**
   * Handles keydown events for focus trapping.
   *
   * @param event - The keyboard event.
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.escape.emit();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = this.getFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

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
    const focusableElements = this.getFocusableElements();
    /* v8 ignore start */
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
    /* v8 ignore stop */
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
    return Array.from(nodes as NodeListOf<HTMLElement>).filter((el: HTMLElement) => {
      /* v8 ignore next 6 */
      return (
        el.offsetWidth > 0 &&
        el.offsetHeight > 0 &&
        !el.hasAttribute('hidden') &&
        window.getComputedStyle(el).visibility !== 'hidden'
      );
    });
  }
}
