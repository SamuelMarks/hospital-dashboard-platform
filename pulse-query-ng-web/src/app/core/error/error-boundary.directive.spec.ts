import { Component, ErrorHandler } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ErrorBoundaryDirective } from './error-boundary.directive';

@Component({
  standalone: true,
  imports: [CommonModule, ErrorBoundaryDirective],
  template: `
    <ng-template #fallback let-error let-retry="retry">
      <div data-testid="fallback">
        <span data-testid="error-text">{{ error?.message || error }}</span>
        <button data-testid="retry-btn" (click)="retry()">Retry</button>
      </div>
    </ng-template>

    <div *appErrorBoundary="fallback">
      <div data-testid="content">Content OK</div>
    </div>
  `
})
class HostComponent {
}

describe('ErrorBoundaryDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let mockHandler: { clearError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockHandler = { clearError: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: ErrorHandler, useValue: mockHandler }]
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
  });

  it('should render content when no error', () => {
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-testid="content"]'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('[data-testid="fallback"]'))).toBeFalsy();
  });

  it('should render fallback when content throws', () => {
    fixture.detectChanges();
    const boundaryNode = fixture.debugElement.queryAllNodes(node =>
      (node as any).providerTokens?.includes(ErrorBoundaryDirective)
    )[0] as any;
    if (!boundaryNode) {
      throw new Error('ErrorBoundaryDirective not found');
    }
    const boundary = boundaryNode.injector.get(ErrorBoundaryDirective) as any;
    const originalCreate = boundary.vcr.createEmbeddedView.bind(boundary.vcr);
    let thrown = false;
    boundary.vcr.createEmbeddedView = vi.fn((...args: any[]) => {
      if (!thrown) {
        thrown = true;
        throw new Error('Boom');
      }
      return originalCreate(...args);
    });
    boundary.renderContent();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-testid="fallback"]'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('[data-testid="error-text"]')).nativeElement.textContent)
      .toContain('Boom');
  });

  it('should retry and clear error', () => {
    fixture.detectChanges();
    const boundaryNode = fixture.debugElement.queryAllNodes(node =>
      (node as any).providerTokens?.includes(ErrorBoundaryDirective)
    )[0] as any;
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
});
