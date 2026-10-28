/**
 * @fileoverview Functional Directive providing "Safe Mode" UI swapping.
 * Similar to React Error Boundaries, this allows components to catch
 * creation-time errors or listen to the global error bus to replace
 * their content with a fallback template.
 */

import { Directive, TemplateRef, ViewContainerRef, inject, OnInit, input } from '@angular/core';
import { GlobalErrorHandler } from './global-error.handler';

/**
 * Context for the Fallback Template.
 * Exposes the error object and a retry function to the template.
 */
export interface ErrorBoundaryContext {
  /** Caught error instance exposed as the default template context variable. */
  $implicit: unknown;
  /** Callback function that clears the error state and re-renders the primary template. */
  retry: () => void;
}

/**
 * Error Boundary Directive.
 *
 * Wraps content and catches unhandled exceptions occurring within its View Hierarchy logic.
 * If an error occurs that is traced back to this component subtree (via explicit renderFallback calls
 * or global monitoring if extended), it destroys the content and renders the `fallback` template instead.
 *
 * **Usage:**
 * ```html
 * <div *appErrorBoundary="fallbackTemplate">
 *    <complex-widget></complex-widget>
 * </div>
 *
 * <ng-template #fallbackTemplate let-error let-retry="retry">
 *    <div class="error-box">
 *      Crashed: {{ error.message }}
 *      <button (click)="retry()">Retry</button>
 *    </div>
 * </ng-template>
 * ```
 */
@Directive({
  selector: '[appErrorBoundary]',
})
export class ErrorBoundaryDirective implements OnInit {
  /** View container reference used to mount either the primary template or the fallback view. */
  readonly vcr = inject(ViewContainerRef);
  /** Primary structural template reference wrapped by the error boundary. */
  private readonly templateCallback = inject(TemplateRef<unknown>);
  /** Global error handler instance used to reset global error state on retry. */
  private readonly globalHandler = inject(GlobalErrorHandler);

  /**
   * The Fallback Template to render when an error state is active.
   */
  readonly appErrorBoundary = input<TemplateRef<ErrorBoundaryContext> | undefined>(undefined);

  /**
   * Initializes the view.
   * Attempts initial render and subscribes to global errors (if needed for monitoring).
   */
  ngOnInit(): void {
    this.renderContent();
  }

  /**
   * Attempts to render the main content.
   * If the rendering fails synchronously (e.g. OnInit crash in child),
   * it catches the exception and switches to fallback.
   */
  renderContent(): void {
    this.vcr.clear();

    try {
      this.vcr.createEmbeddedView(this.templateCallback);
    } catch (e) {
      this.renderFallback(e);
    }
  }

  /**
   * Switches the view to the Fallback template.
   *
   * @param {unknown} error - The exception caught.
   */
  public renderFallback(error: unknown): void {
    this.vcr.clear();
    const fallbackTemplate = this.appErrorBoundary();
    if (fallbackTemplate) {
      this.vcr.createEmbeddedView(fallbackTemplate, {
        $implicit: error,
        retry: () => {
          this.globalHandler.clearError(); // Clear global state if needed
          this.renderContent();
        },
      });
    }
  }
}
