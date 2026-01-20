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
      imports: [VizMetricComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(VizMetricComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display primitive values correctly', () => {
    fixture.componentRef.setInput('data', 42);
    fixture.detectChanges();
    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.nativeElement.textContent.trim()).toBe('42');
  });

  it('should fallback to dash', () => {
    fixture.componentRef.setInput('data', null);
    fixture.detectChanges();
    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.nativeElement.textContent.trim()).toBe('-');
  });

  it('should extract value from object structure', () => {
    fixture.componentRef.setInput('data', { value: 99, label: 'Test' });
    fixture.detectChanges();
    
    const valueEl = fixture.debugElement.query(By.css('.metric-value'));
    expect(valueEl.nativeElement.textContent.trim()).toBe('99');
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
    expect(paths.length).toBe(2); // Stroke and Fill paths
    
    // Check Direction (Start 10 < End 30 -> Positive)
    expect(paths[0].classes['spark-pos']).toBe(true);
  });

  it('should NOT render Sparkline if trend_data is missing or too short', () => {
    fixture.componentRef.setInput('data', { value: 100, trend_data: [10] }); // Only 1 point
    fixture.detectChanges();

    const svg = fixture.debugElement.query(By.css('svg.sparkline-container'));
    expect(svg).toBeFalsy();
  });
});