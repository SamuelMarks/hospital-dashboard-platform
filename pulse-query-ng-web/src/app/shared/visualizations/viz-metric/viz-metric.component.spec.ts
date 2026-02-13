/**
 * @fileoverview Unit tests for VizMetricComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { VizMetricComponent } from './viz-metric.component';
import { By } from '@angular/platform-browser';

describe('VizMetricComponent', () => {
  let component: VizMetricComponent;
  let fixture: ComponentFixture<VizMetricComponent>;
  let dataSig: any;
  let configSig: any;
  let titleOverrideSig: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizMetricComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VizMetricComponent);
    component = fixture.componentInstance;
    dataSig = signal<any | null>(null);
    configSig = signal<any>(null);
    titleOverrideSig = signal<string>('');
    (component as any).data = dataSig;
    (component as any).config = configSig;
    (component as any).titleOverride = titleOverrideSig;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display primitive values correctly', () => {
    dataSig.set(42);
    fixture.detectChanges();
    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.nativeElement.textContent.trim()).toBe('42');
  });

  it('should fallback to dash', () => {
    dataSig.set(null);
    fixture.detectChanges();
    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.nativeElement.textContent.trim()).toBe('-');
  });

  it('should extract value from object structure', () => {
    dataSig.set({ value: 99, label: 'Test' });
    fixture.detectChanges();

    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.nativeElement.textContent.trim()).toBe('99');
  });

  it('should apply warning class when value exceeds warning threshold', () => {
    dataSig.set(85);
    configSig.set({ thresholds: { warning: 80, critical: 90 } });
    fixture.detectChanges();

    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.classes['val-warn']).toBe(true);
    expect(valueEl.classes['val-critical']).toBeFalsy();
  });

  it('should apply critical class when value exceeds critical threshold', () => {
    dataSig.set(95);
    configSig.set({ thresholds: { warning: 80, critical: 90 } });
    fixture.detectChanges();

    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.classes['val-critical']).toBe(true);
  });

  it('should render Sparkline if trend_data is provided', () => {
    const dataWithTrend = { value: 100, trend_data: [10, 20, 15, 30] };
    dataSig.set(dataWithTrend);
    fixture.detectChanges();

    const svg = fixture.debugElement.query(By.css('svg.sparkline-container'));
    expect(svg).toBeTruthy();

    const paths = svg.queryAll(By.css('path'));
    expect(paths.length).toBe(2); // Stroke and Fill paths

    // Check Direction (Start 10 < End 30 -> Positive)
    expect(paths[0].classes['spark-pos']).toBe(true);
  });

  it('should NOT render Sparkline if trend_data is missing or too short', () => {
    dataSig.set({ value: 100, trend_data: [10] }); // Only 1 point
    fixture.detectChanges();

    const svg = fixture.debugElement.query(By.css('svg.sparkline-container'));
    expect(svg).toBeFalsy();
  });

  it('should derive label from columns or override', () => {
    dataSig.set({ columns: ['Value'], data: [{ Value: 10 }] });
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('Value');

    titleOverrideSig.set('Custom Title');
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('Custom Title');
  });

  it('should parse trend and compute negative direction', () => {
    dataSig.set({ value: 100, trend: -5, trend_data: [10, 5] });
    fixture.detectChanges();
    expect(component.parsedTrend()).toBe(-5);
    expect(component.isTrendUp()).toBe(false);
    expect(component.sparklineFill()).toBeTruthy();
  });

  it('should return empty alert class when no thresholds', () => {
    dataSig.set(5);
    configSig.set(null);
    fixture.detectChanges();
    expect(component.alertClass()).toBe('');
  });

  it('should extract value from dataset and object', () => {
    dataSig.set({ columns: ['Value'], data: [{ Value: 12 }] });
    fixture.detectChanges();
    expect(component.displayValue()).toBe(12);

    dataSig.set({ a: 7, b: 'x' });
    fixture.detectChanges();
    expect(component.displayValue()).toBe(7);
  });

  it('should fallback when dataset row has no keys', () => {
    dataSig.set({ columns: [], data: [{}] });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');
  });

  it('should derive label from data label property', () => {
    dataSig.set({ value: 1, label: 'Label' });
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('Label');
  });

  it('should return null trend when missing', () => {
    dataSig.set({ value: 1 });
    fixture.detectChanges();
    expect(component.parsedTrend()).toBeNull();
  });

  it('should treat short trend series as upward and no fill', () => {
    dataSig.set({ value: 1, trend_data: [5] });
    fixture.detectChanges();
    expect(component.isTrendUp()).toBe(true);
    expect(component.sparklineFill()).toBeNull();
  });

  it('should handle flat sparkline data', () => {
    dataSig.set({ value: 1, trend_data: [5, 5, 5] });
    fixture.detectChanges();
    expect(component.sparklinePath()).toBeTruthy();
  });

  it('should display string values', () => {
    dataSig.set('hello');
    fixture.detectChanges();
    expect(component.displayValue()).toBe('hello');
  });

  it('should fallback to dash when no numeric value found', () => {
    dataSig.set({ a: 'x' });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');
  });

  it('should return empty alert class when below thresholds', () => {
    dataSig.set(10);
    configSig.set({ thresholds: { warning: 50, critical: 100 } });
    fixture.detectChanges();
    expect(component.alertClass()).toBe('');
  });
});
