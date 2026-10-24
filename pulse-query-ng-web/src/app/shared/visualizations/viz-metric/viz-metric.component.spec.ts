/**
 * @fileoverview Unit tests for VizMetricComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VizMetricComponent } from './viz-metric.component';
import { By } from '@angular/platform-browser';

describe('VizMetricComponent', () => {
  let component: VizMetricComponent;
  let fixture: ComponentFixture<VizMetricComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizMetricComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VizMetricComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('data', null);
    fixture.componentRef.setInput('config', null);
    fixture.componentRef.setInput('titleOverride', '');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display primitive values correctly', () => {
    fixture.componentRef.setInput('data', 42);
    fixture.detectChanges();
    const valueEl = fixture.debugElement.query(By.css('.metric-value'))
      .nativeElement as HTMLElement;
    expect(valueEl.textContent?.trim()).toBe('42');
  });

  it('should fallback to dash', () => {
    fixture.componentRef.setInput('data', null);
    fixture.detectChanges();
    let valueEl = fixture.debugElement.query(By.css('.metric-value')).nativeElement as HTMLElement;
    expect(valueEl.textContent?.trim()).toBe('-');

    fixture.componentRef.setInput('data', undefined);
    fixture.detectChanges();
    valueEl = fixture.debugElement.query(By.css('.metric-value')).nativeElement as HTMLElement;
    expect(valueEl.textContent?.trim()).toBe('-');
  });

  it('should extract value from object structure', () => {
    fixture.componentRef.setInput('data', { value: 99, label: 'Test' });
    fixture.detectChanges();

    const valueEl = fixture.debugElement.query(By.css('.metric-value'))
      .nativeElement as HTMLElement;
    expect(valueEl.textContent?.trim()).toBe('99');
  });

  it('should apply warning class when value exceeds warning threshold', () => {
    fixture.componentRef.setInput('data', 85);
    fixture.componentRef.setInput('config', { thresholds: { warning: 80, critical: 90 } });
    fixture.detectChanges();

    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.classes['val-warn']).toBe(true);
    expect(valueEl.classes['val-critical']).toBeFalsy();
  });

  it('should apply critical class when value exceeds critical threshold', () => {
    fixture.componentRef.setInput('data', 95);
    fixture.componentRef.setInput('config', { thresholds: { warning: 80, critical: 90 } });
    fixture.detectChanges();

    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.classes['val-critical']).toBe(true);
  });

  it('should render Sparkline if trend_data is provided', () => {
    const dataWithTrend = { value: 100, trend_data: [10, 20, 15, 30] };
    fixture.componentRef.setInput('data', dataWithTrend);
    fixture.detectChanges();

    const svg = fixture.debugElement.query(By.css('svg.sparkline-container'));
    expect(svg).toBeTruthy();

    const paths = svg.queryAll(By.css('path'));
    expect(paths.length).toBe(2);
    expect(paths[0]?.classes['spark-pos']).toBe(true);
  });

  it('should NOT render Sparkline if trend_data is missing, not array, or too short', () => {
    fixture.componentRef.setInput('data', { value: 100, trend_data: [10] });
    fixture.detectChanges();

    let svg = fixture.debugElement.query(By.css('svg.sparkline-container'));
    expect(svg).toBeFalsy();

    fixture.componentRef.setInput('data', { value: 100, trend_data: 'invalid' });
    fixture.detectChanges();

    svg = fixture.debugElement.query(By.css('svg.sparkline-container'));
    expect(svg).toBeFalsy();
    expect(component.trendSeries()).toEqual([]);
  });

  it('should derive label from columns or override', () => {
    fixture.componentRef.setInput('data', { columns: ['Value'], data: [{ Value: 10 }] });
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('Value');

    fixture.componentRef.setInput('titleOverride', 'Custom Title');
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('Custom Title');
  });

  it('should parse trend and compute negative direction', () => {
    fixture.componentRef.setInput('data', { value: 100, trend: -5, trend_data: [10, 5] });
    fixture.detectChanges();
    expect(component.parsedTrend()).toBe(-5);
    expect(component.isTrendUp()).toBe(false);
    expect(component.sparklineFill()).toBeTruthy();

    fixture.componentRef.setInput('data', { value: 100, trend: 5, trend_data: [10, 20] });
    fixture.detectChanges();
    expect(component.parsedTrend()).toBe(5);
    expect(component.isTrendUp()).toBe(true);
  });

  it('should return empty alert class when no thresholds or empty config', () => {
    fixture.componentRef.setInput('data', 5);
    fixture.componentRef.setInput('config', null);
    fixture.detectChanges();
    expect(component.alertClass()).toBe('');

    fixture.componentRef.setInput('config', {});
    fixture.detectChanges();
    expect(component.alertClass()).toBe('');
  });

  it('should extract value from dataset and object', () => {
    fixture.componentRef.setInput('data', { columns: ['Value'], data: [{ Value: 12 }] });
    fixture.detectChanges();
    expect(component.displayValue()).toBe(12);

    fixture.componentRef.setInput('data', { a: 7, b: 'x' });
    fixture.detectChanges();
    expect(component.displayValue()).toBe(7);
  });

  it('should fallback when dataset row has no keys or empty array', () => {
    fixture.componentRef.setInput('data', { columns: [], data: [{}] });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');

    fixture.componentRef.setInput('data', { data: [{}] });
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('');

    fixture.componentRef.setInput('data', { data: [] });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');
  });

  it('should derive label from data label property', () => {
    fixture.componentRef.setInput('data', { value: 1, label: 'Label' });
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('Label');
  });

  it('should return null trend when missing', () => {
    fixture.componentRef.setInput('data', { value: 1 });
    fixture.detectChanges();
    expect(component.parsedTrend()).toBeNull();
  });

  it('should treat short trend series as upward and no fill', () => {
    fixture.componentRef.setInput('data', { value: 1, trend_data: [5] });
    fixture.detectChanges();
    expect(component.isTrendUp()).toBe(true);
    expect(component.sparklineFill()).toBeNull();
  });

  it('should fallback to dash when no numeric value found or input is array', () => {
    fixture.componentRef.setInput('data', { a: 'x' });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');

    fixture.componentRef.setInput('data', [1, 2, 3]);
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');
  });

  it('should return empty alert class when below thresholds', () => {
    fixture.componentRef.setInput('data', 10);
    fixture.componentRef.setInput('config', { thresholds: { warning: 50, critical: 100 } });
    fixture.detectChanges();
    expect(component.alertClass()).toBe('');
  });

  it('should display non-number non-object values as strings', () => {
    fixture.componentRef.setInput('data', 'hello world');
    fixture.detectChanges();
    const valueEl = fixture.debugElement.query(By.css('.metric-value'))
      .nativeElement as HTMLElement;
    expect(valueEl.textContent?.trim()).toBe('hello world');
  });

  it('should handle sparkline when min and max are equal', () => {
    fixture.componentRef.setInput('data', { value: 100, trend_data: [5, 5] });
    fixture.detectChanges();
    const svg = fixture.debugElement.query(By.css('svg.sparkline-container'));
    expect(svg).toBeTruthy();
  });

  it('should return empty string if value is not number', () => {
    fixture.componentRef.setInput('data', 'hello');
    fixture.componentRef.setInput('config', { thresholds: { warning: 50, critical: 100 } });
    fixture.detectChanges();
    expect(component.alertClass()).toBe('');
  });

  it('should apply warning class when critical is undefined but warning is met', () => {
    fixture.componentRef.setInput('data', 60);
    fixture.componentRef.setInput('config', { thresholds: { warning: 50 } });
    fixture.detectChanges();
    expect(component.alertClass()).toBe('val-warn');
  });

  it('should apply critical class when warning is undefined but critical is met', () => {
    fixture.componentRef.setInput('data', 110);
    fixture.componentRef.setInput('config', { thresholds: { critical: 100 } });
    fixture.detectChanges();
    expect(component.alertClass()).toBe('val-critical');
  });

  it('should cover empty array and missing columns branches', () => {
    fixture.componentRef.setInput('data', []);
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');

    fixture.componentRef.setInput('data', { data: [{ val: 10 }], columns: [] });
    fixture.detectChanges();
    expect(component.displayLabel()).toBe('');

    fixture.componentRef.setInput('data', { value: 20 });
    fixture.detectChanges();
    expect(component.parsedTrend()).toBeNull();

    fixture.componentRef.setInput('data', { non_num: 'str', num: 42, label: null, trend: null });
    fixture.detectChanges();
    expect(component.displayValue()).toBe(42);
    expect(component.displayLabel()).toBe('');
    expect(component.parsedTrend()).toBeNull();

    fixture.componentRef.setInput('data', { only_str: 'abc' });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');

    fixture.componentRef.setInput('data', { value: null });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');

    fixture.componentRef.setInput('data', { data: [] });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');

    fixture.componentRef.setInput('data', { data: [{}] });
    fixture.detectChanges();
    expect(component.displayValue()).toBe('-');
  });
});
