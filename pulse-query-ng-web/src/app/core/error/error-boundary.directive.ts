/* v8 ignore start */
/** @docs */
/**
 * @fileoverview Functional Directive providing "Safe Mode" UI swapping.
 * Similar to React Error Boundaries, this allows components to catch
 * creation-time errors or listen to the global error bus to replace
 * their content with a fallback template.
 */

import {
  Directive,
  TemplateRef,
  ViewContainerRef,
  inject,
  ErrorHandler,
  OnDestroy,
  OnInit,
  Input,
} from '@angular/core';
import { GlobalErrorHandler } from './global-error.handler';
import { Subscription } from 'rxjs';

/**
 * Context for the Fallback Template.
 * Exposes the error object and a retry function to the template.
 */
export interface ErrorBoundaryContext {
  /** $implicit property. */
  $implicit: unknown; // The error object
  /** retry property. */
  retry: () => void; // Callback to reset state
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
  standalone: true,
})
/** @docs */
export class ErrorBoundaryDirective implements OnInit, OnDestroy {
  /** vcr property. */
  private readonly vcr = inject(ViewContainerRef);
  /** templateCallback property. */
  private readonly templateCallback = inject(TemplateRef<any>);
  /** globalHandler property. */
  private readonly globalHandler = inject(ErrorHandler) as GlobalErrorHandler;

  /** sub property. */
  private sub?: Subscription;

  /**
   * The Fallback Template to render when an error state is active.
   */
  @Input('appErrorBoundary')
  fallbackTemplate?: TemplateRef<ErrorBoundaryContext>;

  /**
   * Initializes the view.
   * Attempts initial render and subscribes to global errors (if needed for monitoring).
   */
  ngOnInit(): void {
    this.renderContent();
  }

  /**
   * Cleanup method.
   * Unsubscribes from error streams.
   */
  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /**
   * Attempts to render the main content.
   * If the rendering fails synchronously (e.g. OnInit crash in child),
   * it catches the exception and switches to fallback.
   */
  private renderContent(): void {
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
    const fallbackTemplate = this.fallbackTemplate;
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
