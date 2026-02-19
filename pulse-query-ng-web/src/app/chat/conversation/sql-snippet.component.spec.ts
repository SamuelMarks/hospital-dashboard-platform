import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SIGNAL, signalSetFn } from '@angular/core/primitives/signals';
import { SqlSnippetComponent } from './sql-snippet.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('SqlSnippetComponent', () => {
  let component: SqlSnippetComponent;
  let fixture: ComponentFixture<SqlSnippetComponent>;

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
});
