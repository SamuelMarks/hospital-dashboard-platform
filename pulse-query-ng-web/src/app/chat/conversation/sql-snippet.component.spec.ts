import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { SqlSnippetComponent } from './sql-snippet.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('SqlSnippetComponent', () => {
  let component: SqlSnippetComponent;
  let fixture: ComponentFixture<SqlSnippetComponent>;

  beforeAll(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    });
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SqlSnippetComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SqlSnippetComponent);
    component = fixture.componentInstance;
    // Manual signal setting for tests
    Object.defineProperty(component, 'sql', { value: () => 'SELECT * FROM table' });
    fixture.detectChanges();
  });

  it('should emit run event', () => {
    let emittedSql = '';
    component.run.subscribe((s: string) => (emittedSql = s));

    // Find Run button (it has mat-stroked-button and color accent in template)
    const runBtn = fixture.debugElement.query(By.css('button[color="accent"]'));
    runBtn.triggerEventHandler('click', null);
    expect(emittedSql).toBe('SELECT * FROM table');
  });

  it('should emit addToCart event', () => {
    let emitted = '';
    component.addToCart.subscribe((s: string) => (emitted = s));

    const cartBtn = fixture.debugElement.query(By.css('[data-testid="btn-cart"]'));
    expect(cartBtn).toBeTruthy();
    cartBtn.triggerEventHandler('click', null);

    expect(emitted).toBe('SELECT * FROM table');
  });

  it('should emit simulate event', () => {
    let emitted = '';
    component.simulate.subscribe((s: string) => (emitted = s));

    // It's the button with the science icon
    const btn = fixture.debugElement.query(By.css('button[aria-label="Simulate Scenario"]'));
    expect(btn).toBeTruthy();
    btn.triggerEventHandler('click', null);
    expect(emitted).toBe('SELECT * FROM table');
  });

  it('should highlight keywords via method', () => {
    const html = component.highlightedSql;
    expect(html).toContain('<span class="keyword">SELECT</span>');
  });

  it('should highlight strings and numbers', () => {
    Object.defineProperty(component, 'sql', { value: () => "SELECT 100, 'TEXT'" });
    fixture.detectChanges();
    const html = component.highlightedSql;
    expect(html).toContain('<span class="number">100</span>');
    expect(html).toContain('<span class="string">\'TEXT\'</span>');
  });

  it('should highlight comments', () => {
    Object.defineProperty(component, 'sql', { value: () => 'SELECT 1 -- Note' });
    fixture.detectChanges();
    const html = component.highlightedSql;
    expect(html).toContain('<span class="comment">-- Note</span>');
  });

  it('should copy to clipboard', () => {
    Object.defineProperty(component, 'sql', { value: () => 'SELECT 1' });
    const spy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    component.copy();
    expect(spy).toHaveBeenCalledWith('SELECT 1');
  });

  it('should ignore copy if no sql', () => {
    Object.defineProperty(component, 'sql', { value: () => null });
    const spy = vi.spyOn(navigator.clipboard, 'writeText');
    spy.mockClear();
    component.copy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should handle falsy sql in highlightedSql', () => {
    Object.defineProperty(component, 'sql', { value: () => null });
    expect(component.highlightedSql).toBe('');
  });

  it('should ignore emitRun if no sql', () => {
    Object.defineProperty(component, 'sql', { value: () => null });
    let emitted = false;
    component.run.subscribe(() => (emitted = true));
    component.emitRun();
    expect(emitted).toBe(false);
  });

  it('should ignore emitAddToCart if no sql', () => {
    Object.defineProperty(component, 'sql', { value: () => null });
    let emitted = false;
    component.addToCart.subscribe(() => (emitted = true));
    component.emitAddToCart();
    expect(emitted).toBe(false);
  });

  it('should ignore emitSimulate if no sql', () => {
    Object.defineProperty(component, 'sql', { value: () => null });
    let emitted = false;
    component.simulate.subscribe(() => (emitted = true));
    component.emitSimulate();
    expect(emitted).toBe(false);
  });
});
