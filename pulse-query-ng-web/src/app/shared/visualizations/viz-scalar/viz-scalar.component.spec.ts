/**
 * @fileoverview Unit tests for VizScalarComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VizScalarComponent } from './viz-scalar.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('VizScalarComponent', () => {
  let component: VizScalarComponent;
  let fixture: ComponentFixture<VizScalarComponent>;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizScalarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VizScalarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('data', null);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display simple number', () => {
    const data = { data: [{ val: 1000 }] };
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();

    const valEl = fixture.debugElement.query(By.css('.value-display')).nativeElement as HTMLElement;
    expect(valEl.textContent).toBe('1,000');
  });

  it('should display correlation context', () => {
    const data = {
      columns: ['correlation_coef'],
      data: [{ correlation_coef: 0.85 }],
    };
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();

    const valEl = fixture.debugElement.query(By.css('.value-display')).nativeElement as HTMLElement;
    expect(valEl.textContent).toBe('0.85');

    const gauge = fixture.debugElement.query(By.css('mat-progress-bar'));
    expect(gauge).toBeTruthy();
    expect(gauge.attributes['role']).toBe('meter');
  });

  it('should compute gauge helpers for negative values', () => {
    const data = { columns: ['correlation'], data: [{ correlation: -0.5 }] };
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();

    expect(component.gaugePosition()).toBeCloseTo(25);
    expect(component.colorClass()).toBe('gauge-neg');
    expect(component.strengthLabel()).toContain('Moderate');
  });

  it('should compute strength color as variable', () => {
    fixture.componentRef.setInput('data', {
      columns: ['correlation'],
      data: [{ correlation: -0.9 }],
    });
    fixture.detectChanges();
    expect(component.strengthColor()).toBe('var(--sys-error)');
  });

  it('should fall back to neutral helpers when value is missing', () => {
    fixture.componentRef.setInput('data', {});
    fixture.detectChanges();

    expect(component.value()).toBeNull();
    expect(component.gaugePosition()).toBe(50);
    expect(component.colorClass()).toBe('gauge-neutral');
    expect(component.strengthColor()).toBe('var(--sys-text-secondary)');
    expect(component.strengthLabel()).toBe('Weak / No Correlation');
  });

  it('should use data.value if it is a number and data is not an array', () => {
    fixture.componentRef.setInput('data', { value: 42 });
    fixture.detectChanges();
    expect(component.value()).toBe(42);
    expect(component.formattedValue()).toBe('42');
  });

  it('should return null if first row has no number values', () => {
    fixture.componentRef.setInput('data', { data: [{ str: 'hello' }] });
    fixture.detectChanges();
    expect(component.value()).toBeNull();
  });

  it('should fallback to d.columns[0] if no column other than "value" exists', () => {
    fixture.componentRef.setInput('data', { columns: ['value'] });
    fixture.detectChanges();
    expect(component.label()).toBe('value');
  });

  it('should return "Weak / No Correlation" for |value| < 0.3', () => {
    fixture.componentRef.setInput('data', {
      columns: ['correlation'],
      data: [{ correlation: 0.2 }],
    });
    fixture.detectChanges();
    expect(component.strengthLabel()).toBe('Weak / No Correlation');
  });

  it('should return "Strong Correlation" for |value| >= 0.7', () => {
    fixture.componentRef.setInput('data', {
      columns: ['correlation'],
      data: [{ correlation: 0.8 }],
    });
    fixture.detectChanges();
    expect(component.strengthLabel()).toBe('Strong Correlation');
  });

  it('should return null when data array is empty', () => {
    fixture.componentRef.setInput('data', { data: [] });
    fixture.detectChanges();
    expect(component.value()).toBeNull();
  });
});
