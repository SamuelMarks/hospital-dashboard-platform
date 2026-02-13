/**
 * @fileoverview Unit tests for VizScalarComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { VizScalarComponent } from './viz-scalar.component';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';

describe('VizScalarComponent', () => {
  let component: VizScalarComponent;
  let fixture: ComponentFixture<VizScalarComponent>;
  let dataSig: any;

  /**
   * Fix for "TypeError: mql.addListener is not a function" on CI.
   */
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
      imports: [VizScalarComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(VizScalarComponent);
    component = fixture.componentInstance;
    dataSig = signal<any | null>(null);
    (component as any).data = dataSig;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display simple number', () => {
    const data = { data: [{ val: 1000 }] };
    dataSig.set(data);
    fixture.detectChanges();

    const valEl = fixture.debugElement.query(By.css('.value-display'));
    expect(valEl.nativeElement.textContent).toBe('1,000');

    // MatProgressBar should NOT be present
    expect(fixture.debugElement.query(By.css('mat-progress-bar'))).toBeFalsy();
  });

  it('should display correlation context', () => {
    const data = {
      columns: ['correlation_coef'],
      data: [{ correlation_coef: 0.85 }],
    };
    dataSig.set(data);
    fixture.detectChanges();

    const valEl = fixture.debugElement.query(By.css('.value-display'));
    expect(valEl.nativeElement.textContent).toBe('0.85');

    // Query for the material component directly as internal class logic might vary
    const gauge = fixture.debugElement.query(By.css('mat-progress-bar'));
    expect(gauge).toBeTruthy();
    expect(gauge.attributes['role']).toBe('meter');

    const text = fixture.debugElement.query(By.css('.interpret-text'));
    expect(text.nativeElement.textContent).toContain('Strong');
  });

  it('should handle non-correlation values', () => {
    const data = { columns: ['value'], data: [{ value: 10 }] };
    dataSig.set(data);
    fixture.detectChanges();

    expect(component.isCorrelation()).toBe(false);
    expect(component.formattedValue()).toBe('10');
  });

  it('should compute gauge helpers for negative values', () => {
    const data = { columns: ['correlation'], data: [{ correlation: -0.5 }] };
    dataSig.set(data);
    fixture.detectChanges();

    expect(component.gaugePosition()).toBeCloseTo(25);
    expect(component.colorClass()).toBe('gauge-neg');
    expect(component.strengthLabel()).toContain('Moderate');
  });

  it('should read value from explicit object', () => {
    dataSig.set({ value: 0.2 });
    fixture.detectChanges();
    expect(component.value()).toBe(0.2);
  });

  it('should compute strength color', () => {
    dataSig.set({ columns: ['correlation'], data: [{ correlation: -0.9 }] });
    fixture.detectChanges();
    expect(component.strengthColor()).toBe('#f44336');
  });

  it('should return null value when no numeric field found', () => {
    dataSig.set({ data: [{ label: 'none' }] });
    fixture.detectChanges();
    expect(component.value()).toBeNull();
    expect(component.formattedValue()).toBe('-');
  });

  it('should return null when data array is empty', () => {
    dataSig.set({ data: [] });
    fixture.detectChanges();
    expect(component.value()).toBeNull();
  });

  it('should fall back to neutral helpers when value is missing', () => {
    dataSig.set({ data: 'invalid' } as any);
    fixture.detectChanges();

    expect(component.value()).toBeNull();
    expect(component.gaugePosition()).toBe(50);
    expect(component.colorClass()).toBe('gauge-neutral');
    expect(component.strengthLabel()).toContain('Weak');
    expect(component.strengthColor()).toBe('var(--sys-text-secondary)');
  });
});
