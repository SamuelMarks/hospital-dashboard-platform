/**
 * @fileoverview Unit tests for Error Boundary Directive.
 */

import { Component, TemplateRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ErrorBoundaryDirective, ErrorBoundaryContext } from './error-boundary.directive';
import { ErrorHandler } from '@angular/core';
import { GlobalErrorHandler } from './global-error.handler';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';

/**
 * Host component to test structural directive usage.
 */
@Component({
  standalone: false,
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
  `
})
class TestHostComponent {
  shouldCrash = false;
  throwError() { throw new Error('Crash!'); }
}

@Component({
  standalone: false,
  template: `
    <div *appErrorBoundary="missingTemplate">
      <div id="content">Safe Content</div>
    </div>
  `
})
class MissingTemplateHostComponent {
  missingTemplate?: TemplateRef<ErrorBoundaryContext>;
}

describe('ErrorBoundaryDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let handlerMock: { clearError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    handlerMock = { clearError: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CommonModule, ErrorBoundaryDirective],
      declarations: [TestHostComponent, MissingTemplateHostComponent],
      providers: [
        { provide: ErrorHandler, useValue: handlerMock },
        { provide: GlobalErrorHandler, useValue: handlerMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  it('should render main content when no error occurs', () => {
    const el = fixture.debugElement.query(By.css('#content'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('Safe Content');
    expect(fixture.debugElement.query(By.css('#fallback'))).toBeFalsy();
  });

  it('should switch to fallback template on error (simulated via method call)', () => {
    // 1. Get directive instance
    const debugNode = fixture.debugElement.queryAllNodes((node) => true)
        .find(n => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective);

    expect(directive).toBeTruthy();

    // 2. Trigger fallback manually (simulating catch)
    directive?.renderFallback('Manual Crash');
    fixture.detectChanges();

    // 3. Verify Fallback UI
    const fallback = fixture.debugElement.query(By.css('#fallback'));
    expect(fallback).toBeTruthy();
    expect(fallback.nativeElement.textContent).toContain('Manual Crash');
    expect(fixture.debugElement.query(By.css('#content'))).toBeFalsy();
  });

  it('should call global handler clearError() when retry is clicked', () => {
    const debugNode = fixture.debugElement.queryAllNodes((node) => true)
        .find(n => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective);

    // Enter Error State
    directive?.renderFallback('Crash');
    fixture.detectChanges();

    // Click Retry
    const btn = fixture.debugElement.query(By.css('#retry-btn'));
    btn.triggerEventHandler('click', null);
    fixture.detectChanges();

    expect(handlerMock.clearError).toHaveBeenCalled();
    // Should attempt to re-render content
    expect(fixture.debugElement.query(By.css('#content'))).toBeTruthy();
  });

  it('should render fallback when content creation throws', () => {
    const debugNode = fixture.debugElement.queryAllNodes((node) => true)
        .find(n => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective) as any;

    const originalCreate = directive.vcr.createEmbeddedView.bind(directive.vcr);
    vi.spyOn(directive.vcr, 'createEmbeddedView')
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockImplementation((...args: any[]) => originalCreate(...args));

    directive.ngOnInit();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('#fallback'))).toBeTruthy();
  });

  it('should skip rendering fallback when no template is provided', () => {
    const noTemplateFixture = TestBed.createComponent(MissingTemplateHostComponent);
    noTemplateFixture.detectChanges();

    const debugNode = noTemplateFixture.debugElement.queryAllNodes((node) => true)
        .find(n => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective) as any;

    const createSpy = vi.spyOn(directive.vcr, 'createEmbeddedView');
    createSpy.mockClear();

    directive.renderFallback('No template');

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('should unsubscribe on destroy', () => {
    const debugNode = fixture.debugElement.queryAllNodes((node) => true)
        .find(n => n.injector.get(ErrorBoundaryDirective, null) !== null);
    const directive = debugNode?.injector.get(ErrorBoundaryDirective) as any;

    directive.sub = { unsubscribe: vi.fn() };
    directive.ngOnDestroy();

    expect(directive.sub.unsubscribe).toHaveBeenCalled();
  });
});
