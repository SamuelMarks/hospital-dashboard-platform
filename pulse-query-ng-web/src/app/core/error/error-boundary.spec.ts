/**
 * @fileoverview Unit tests for Error Boundary Directive.
 */

import { Component, TemplateRef, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ErrorBoundaryDirective, ErrorBoundaryContext } from './error-boundary.directive';
import { ErrorHandler } from '@angular/core';
import { GlobalErrorHandler } from './global-error.handler';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

/**
 * Host component to test structural directive usage.
 */
@Component({
  imports: [ErrorBoundaryDirective],
  template: `
    <div *appErrorBoundary="fallbackTpl">
      @if (shouldCrash) {
        <div>{{ throwError() }}</div>
      } @else {
        <div id="content">Safe Content</div>
      }
    </div>

    <ng-template #fallbackTpl let-err let-retry="retry">
      <div id="fallback">
        Error: {{ err }}
        <button id="retry-btn" (click)="retry()">Retry</button>
      </div>
    </ng-template>
  `,
})
class TestHostComponent {
  /** Whether the child view should throw during rendering. */
  shouldCrash = false;

  /**
   * Throws a synthetic crash error during template evaluation.
   */
  throwError(): never {
    throw new Error('Crash!');
  }
}

/** Host component with an undefined fallback template reference. */
@Component({
  imports: [ErrorBoundaryDirective],
  template: `
    <div *appErrorBoundary="missingTemplate">
      <div id="content">Safe Content</div>
    </div>
  `,
})
class MissingTemplateHostComponent {
  /** Undefined fallback template reference. */
  missingTemplate?: TemplateRef<ErrorBoundaryContext>;
}

describe('ErrorBoundaryDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let handlerMock: { clearError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    handlerMock = { clearError: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ErrorBoundaryDirective, TestHostComponent, MissingTemplateHostComponent],
      providers: [
        { provide: ErrorHandler, useValue: handlerMock },
        { provide: GlobalErrorHandler, useValue: handlerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  it('should render main content when no error occurs', () => {
    const el = fixture.debugElement.query(By.css('#content'));
    expect(el).toBeTruthy();
    expect((el.nativeElement as HTMLElement).textContent).toContain('Safe Content');
    expect(fixture.debugElement.query(By.css('#fallback'))).toBeFalsy();
  });

  it('should switch to fallback template on error (simulated via method call)', () => {
    const debugNode = fixture.debugElement
      .queryAllNodes(() => true)
      .find((n) => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective);

    expect(directive).toBeTruthy();

    directive?.renderFallback('Manual Crash');
    fixture.detectChanges();

    const fallback = fixture.debugElement.query(By.css('#fallback'));
    expect(fallback).toBeTruthy();
    expect((fallback.nativeElement as HTMLElement).textContent).toContain('Manual Crash');
    expect(fixture.debugElement.query(By.css('#content'))).toBeFalsy();
  });

  it('should call global handler clearError() when retry is clicked', () => {
    const debugNode = fixture.debugElement
      .queryAllNodes(() => true)
      .find((n) => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective);

    directive?.renderFallback('Crash');
    fixture.detectChanges();

    const btn = fixture.debugElement.query(By.css('#retry-btn'));
    btn.triggerEventHandler('click', null);
    fixture.detectChanges();

    expect(handlerMock.clearError).toHaveBeenCalled();
    expect(fixture.debugElement.query(By.css('#content'))).toBeTruthy();
  });

  it('should render fallback when content creation throws', () => {
    const debugNode = fixture.debugElement
      .queryAllNodes(() => true)
      .find((n) => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective);
    if (!directive) {
      throw new Error('ErrorBoundaryDirective not found');
    }

    const originalCreate = directive.vcr.createEmbeddedView.bind(directive.vcr);
    vi.spyOn(directive.vcr, 'createEmbeddedView')
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockImplementation((...args: Parameters<ViewContainerRef['createEmbeddedView']>) =>
        originalCreate(...args),
      );

    directive.ngOnInit();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#fallback'))).toBeTruthy();
  });

  it('should skip rendering fallback when no template is provided', () => {
    const noTemplateFixture = TestBed.createComponent(MissingTemplateHostComponent);
    noTemplateFixture.detectChanges();

    const debugNode = noTemplateFixture.debugElement
      .queryAllNodes(() => true)
      .find((n) => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective);
    if (!directive) {
      throw new Error('ErrorBoundaryDirective not found');
    }

    const createSpy = vi.spyOn(directive.vcr, 'createEmbeddedView');
    createSpy.mockClear();

    directive.renderFallback('No template');

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('should clean up subscription on destroy', () => {
    expect(() => fixture.destroy()).not.toThrow();
  });
});
