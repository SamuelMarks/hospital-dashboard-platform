/**
 * @fileoverview Unit tests for VizChartComponent.
 * Includes dependency mocking for Material Color Utilities used by ThemeService.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { VizChartComponent } from './viz-chart.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({
    schemes: {
      light: new Proxy({}, { get: () => 0xffffffff }),
      dark: new Proxy({}, { get: () => 0xffffffff }),
    },
  }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

describe('VizChartComponent', () => {
  let component: VizChartComponent;
  let fixture: ComponentFixture<VizChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizChartComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VizChartComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('dataSet', { columns: [], data: [] });
    fixture.componentRef.setInput('config', undefined);

    fixture.detectChanges();
  });

  it('should auto-detect stacking for 3 column data', () => {
    const data = {
      columns: ['date', 'service', 'cnt'],
      data: [
        { date: '2023-01-01', service: 'A', cnt: 10 },
        { date: '2023-01-01', service: 'B', cnt: 20 },
        { date: '2023-01-02', service: 'A', cnt: 15 },
      ],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.detectChanges();

    const keys = component.axisKeys();
    expect(keys.stack).toBe('service');

    const items = component.processedData();
    expect(items.length).toBe(2);

    const d1 = items.find((i) => i.label === '2023-01-01');
    expect(d1?.segments?.length).toBe(2);
    expect(d1?.value).toBe(30);
  });

  it('should render colored segments', () => {
    const data = {
      columns: ['cat', 'type', 'val'],
      data: [
        { cat: 'C1', type: 'T1', val: 50 },
        { cat: 'C1', type: 'T2', val: 50 },
      ],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', { stackBy: 'type' });
    fixture.detectChanges();

    const segments = fixture.debugElement.queryAll(By.css('.bar-segment'));
    expect(segments.length).toBe(2);
    expect((segments[0]?.nativeElement as HTMLElement).style.height).toBe('50%');
    expect((segments[1]?.nativeElement as HTMLElement).style.height).toBe('50%');
  });

  it('should handle empty data set', () => {
    fixture.componentRef.setInput('dataSet', { columns: [], data: [] });
    fixture.detectChanges();
    expect(component.axisKeys()).toEqual({ x: '', y: '', stack: '' });
    expect(component.processedData().length).toBe(0);
  });

  it('should fallback palette colors when CSS vars are missing', () => {
    const emptyStyle = document.createElement('div').style;
    const styleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue(emptyStyle);

    component.updatePaletteFromDom();

    expect(component.getPalette(-1)).toBe('#ba1a1a');
    styleSpy.mockRestore();
  });

  it('should compute simple chart with negatives', () => {
    const data = {
      columns: ['label', 'value'],
      data: [
        { label: 'A', value: -10 },
        { label: 'B', value: 20 },
      ],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.detectChanges();

    const items = component.processedData();
    expect(items.length).toBe(2);
    expect(items[0]?.isNegative).toBe(true);
  });

  it('should treat missing values as zero in simple data', () => {
    const data = {
      columns: ['label', 'value'],
      data: [
        { label: 'A', value: undefined },
        { label: 'B', value: null },
      ],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.detectChanges();

    const items = component.processedData();
    expect(items[0]?.value).toBe(0);
    expect(items[1]?.value).toBe(0);
  });

  it('should fallback palette when empty', () => {
    component.palette.set([]);
    const colors = component.getPalette(0);
    const neg = component.getPalette(-1);
    expect(colors).toBe('#1976d2');
    expect(neg).toBe('#ba1a1a');
  });

  it('should incorporate reference lines into scaling and render reference lines in simple and stacked charts', () => {
    const data = {
      columns: ['label', 'value'],
      data: [{ label: 'A', value: 1 }],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', {
      referenceLines: [
        { y: 100 },
        { y: 50, label: 'Target SLA', color: '#ff0000', style: 'solid' },
      ],
    });
    fixture.detectChanges();

    const items = component.processedData();
    expect(items[0]?.heightPct).toContain('%');
    const refLines = component.processedReferenceLines();
    expect(refLines.length).toBe(2);
    expect(refLines[0]?.label).toBe('100');
    expect(refLines[1]?.label).toBe('Target SLA');
    expect(refLines[1]?.color).toBe('#ff0000');
    expect(refLines[1]?.style).toBe('solid');

    // Also test stacked chart with referenceLines and zero-range reference line
    const stackedData = {
      columns: ['cat', 'stack', 'val'],
      data: [
        { cat: 'A', stack: 'S1', val: 120 },
        { cat: 'A', stack: 'S2', val: 80 },
        { cat: 'B', stack: 'S1', val: undefined },
      ],
    };
    fixture.componentRef.setInput('dataSet', stackedData);
    fixture.componentRef.setInput('config', {
      stackBy: 'stack',
      referenceLines: [{ y: 150, label: 'Cap' }],
    });
    fixture.detectChanges();

    const stackedRef = component.processedReferenceLines();
    expect(stackedRef.length).toBe(1);
    expect(stackedRef[0]?.bottomPct).toBe('75%');

    // Zero range fallback in processedReferenceLines
    fixture.componentRef.setInput('dataSet', {
      columns: ['label', 'value'],
      data: [{ label: 'A', value: undefined }],
    });
    fixture.componentRef.setInput('config', {
      referenceLines: [{ y: 0 }],
    });
    fixture.detectChanges();
    expect(component.processedReferenceLines()[0]?.bottomPct).toBe('0%');
  });

  it('should handle stacked data with zero totals', () => {
    const data = {
      columns: ['cat', 'stack', 'val'],
      data: [
        { cat: 'A', stack: 'S1', val: 0 },
        { cat: 'A', stack: 'S2', val: -5 },
      ],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', { stackBy: 'stack' });
    fixture.detectChanges();

    const items = component.processedData();
    expect(items[0]?.isStacked).toBe(true);
    expect(items[0]?.segments?.length).toBe(2);
    expect(items[0]?.segments?.[0]?.heightPct).toContain('%');
  });

  it('should use palette when available', () => {
    component.palette.set(['#111', '#222', '#333']);
    expect(component.getPalette(0)).toBe('#111');
    expect(component.getPalette(5)).toBe('#222');
    expect(component.getPalette(-1)).toBe('#333');
  });

  it('should respect explicit axis config', () => {
    const data = {
      columns: ['x', 'y'],
      data: [{ x: 'A', y: 1 }],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', { xKey: 'x', yKey: 'y' });
    fixture.detectChanges();
    expect(component.axisKeys()).toEqual({ x: 'x', y: 'y', stack: '' });
  });

  it('should fallback axis keys when no string columns exist', () => {
    const data = {
      data: [{ a: 1, b: 2, c: 3 }],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', undefined);
    fixture.detectChanges();

    expect(component.axisKeys()).toEqual({ x: 'a', y: 'a', stack: '' });
  });

  it('should fallback y to second column when no numeric columns exist', () => {
    const data = {
      data: [{ a: 'one', b: 'two', c: 'three' }],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', undefined);
    fixture.detectChanges();

    expect(component.axisKeys()).toEqual({ x: 'a', y: 'b', stack: 'b' });
  });

  it('should fallback y to first column when only one column exists', () => {
    const data = {
      data: [{ only: 'A' }],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', undefined);
    fixture.detectChanges();

    expect(component.axisKeys()).toEqual({ x: 'only', y: 'only', stack: '' });
  });

  it('should skip palette update scheduling on the server platform', async () => {
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [VizChartComponent],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    }).compileComponents();

    const serverFixture = TestBed.createComponent(VizChartComponent);
    const serverComponent = serverFixture.componentInstance;
    serverFixture.componentRef.setInput('dataSet', { columns: [], data: [] });
    serverFixture.componentRef.setInput('config', undefined);
    const updateSpy = vi.spyOn(serverComponent, 'updatePaletteFromDom');
    serverFixture.detectChanges();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('should render SVG trend line and points when mode is "line"', () => {
    fixture.componentRef.setInput('mode', 'line');
    fixture.componentRef.setInput('dataSet', {
      columns: ['day', 'admissions'],
      data: [],
    });
    fixture.detectChanges();
    expect(component.linePolylinePoints()).toBe('');
    expect(component.chartAriaLabel()).toContain('Line chart');

    // Single point in line mode
    fixture.componentRef.setInput('dataSet', {
      columns: ['day', 'admissions'],
      data: [{ day: 'Mon', admissions: 10 }],
    });
    fixture.detectChanges();
    expect(component.linePolylinePoints()).toContain('50.00,');

    // Multi point in line mode (including negative point)
    fixture.componentRef.setInput('dataSet', {
      columns: ['day', 'admissions'],
      data: [
        { day: 'Mon', admissions: 10 },
        { day: 'Tue', admissions: -5 },
        { day: 'Wed', admissions: 20 },
      ],
    });
    fixture.detectChanges();

    const svgEl = fixture.debugElement.query(By.css('[data-testid="viz-line-svg"]'));
    expect(svgEl).toBeTruthy();
    const pointEls = fixture.debugElement.queryAll(By.css('[data-testid="viz-line-point"]'));
    expect(pointEls.length).toBe(3);
  });
});
