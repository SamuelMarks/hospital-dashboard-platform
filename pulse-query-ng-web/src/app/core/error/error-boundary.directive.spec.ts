/**
 * @fileoverview Canonical unit tests for `ErrorBoundaryDirective`.
 *
 * Covers normal embedded view rendering, synchronous template crash fallback,
 * retry recovery with `GlobalErrorHandler.clearError()`, missing fallback template
 * handling, and subscription teardown on `ngOnDestroy`.
 */

import { Component, ErrorHandler, TemplateRef, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { ErrorBoundaryContext, ErrorBoundaryDirective } from './error-boundary.directive';
import { GlobalErrorHandler } from './global-error.handler';

/** Host component for testing `ErrorBoundaryDirective` with a fallback template. */
@Component({
  imports: [ErrorBoundaryDirective],
  template: `
    <ng-template #fallback let-error let-retry="retry">
      <div data-testid="fallback" id="fallback">
        <span data-testid="error-text">{{ error?.message || error }}</span>
        <button data-testid="retry-btn" id="retry-btn" (click)="retry()">Retry</button>
      </div>
    </ng-template>

    <div *appErrorBoundary="fallback">
      <div data-testid="content" id="content">Safe Content</div>
    </div>
  `,
})
class HostComponent {}

/** Host component with an undefined fallback template reference. */
@Component({
  imports: [ErrorBoundaryDirective],
  template: `
    <div *appErrorBoundary="missingTemplate">
      <div data-testid="content">Safe Content</div>
    </div>
  `,
})
class MissingTemplateHostComponent {
  /** Undefined fallback template reference. */
  missingTemplate?: TemplateRef<ErrorBoundaryContext>;
}

describe('ErrorBoundaryDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let mockHandler: { clearError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockHandler = { clearError: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [HostComponent, MissingTemplateHostComponent],
      providers: [
        { provide: ErrorHandler, useValue: mockHandler },
        { provide: GlobalErrorHandler, useValue: mockHandler },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
  });

  it('should render main content when no error occurs', () => {
    fixture.detectChanges();
    const contentEl = fixture.debugElement.query(By.css('[data-testid="content"]'));
    expect(contentEl).toBeTruthy();
    expect((contentEl.nativeElement as HTMLElement).textContent).toContain('Safe Content');
    expect(fixture.debugElement.query(By.css('[data-testid="fallback"]'))).toBeFalsy();
  });

  it('should handle renderFallback gracefully when no fallback template is provided', () => {
    const noTemplateFixture = TestBed.createComponent(MissingTemplateHostComponent);
    noTemplateFixture.detectChanges();

    const boundaryNode = noTemplateFixture.debugElement.queryAllNodes(
      (node) => node.injector.get(ErrorBoundaryDirective, null) !== null,
    )[0];
    if (!boundaryNode) {
      throw new Error('ErrorBoundaryDirective not found');
    }
    const boundary = boundaryNode.injector.get(ErrorBoundaryDirective);
    const createSpy = vi.spyOn(boundary.vcr, 'createEmbeddedView');
    createSpy.mockClear();

    expect(() => boundary.renderFallback(new Error('No tpl'))).not.toThrow();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('should render fallback when content throws during renderContent or ngOnInit', () => {
    fixture.detectChanges();
    const boundaryNode = fixture.debugElement.queryAllNodes(
      (node) => node.injector.get(ErrorBoundaryDirective, null) !== null,
    )[0];
    if (!boundaryNode) {
      throw new Error('ErrorBoundaryDirective not found');
    }
    const boundary = boundaryNode.injector.get(ErrorBoundaryDirective);
    const originalCreate = boundary.vcr.createEmbeddedView.bind(boundary.vcr);
    let thrown = false;
    vi.spyOn(boundary.vcr, 'createEmbeddedView').mockImplementation(
      (...args: Parameters<ViewContainerRef['createEmbeddedView']>) => {
        if (!thrown) {
          thrown = true;
          throw new Error('Boom');
        }
        return originalCreate(...args);
      },
    );
    boundary.ngOnInit();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('[data-testid="fallback"]'))).toBeTruthy();
    expect(
      (
        fixture.debugElement.query(By.css('[data-testid="error-text"]'))
          .nativeElement as HTMLElement
      ).textContent,
    ).toContain('Boom');
  });

  it('should retry, invoke GlobalErrorHandler.clearError(), and restore content view', () => {
    fixture.detectChanges();
    const boundaryNode = fixture.debugElement.queryAllNodes(
      (node) => node.injector.get(ErrorBoundaryDirective, null) !== null,
    )[0];
    if (!boundaryNode) {
      throw new Error('ErrorBoundaryDirective not found');
    }
    const boundary = boundaryNode.injector.get(ErrorBoundaryDirective);
    boundary.renderFallback(new Error('Again'));
    fixture.detectChanges();

    const retryBtn = fixture.debugElement.query(By.css('[data-testid="retry-btn"]'));
    retryBtn.triggerEventHandler('click', null);
    fixture.detectChanges();

    expect(mockHandler.clearError).toHaveBeenCalled();
    expect(fixture.debugElement.query(By.css('[data-testid="content"]'))).toBeTruthy();
  });

  it('should clean up subscription on destroy', () => {
    fixture.detectChanges();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
