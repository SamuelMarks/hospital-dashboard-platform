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
    expect(segments[0]).toBeTruthy();
    expect(segments[1]).toBeTruthy();
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
    expect(colors).toBeTruthy();
    expect(neg).toBeTruthy();
  });

  it('should incorporate reference lines into scaling', () => {
    const data = {
      columns: ['label', 'value'],
      data: [{ label: 'A', value: 1 }],
    };
    fixture.componentRef.setInput('dataSet', data);
    fixture.componentRef.setInput('config', { referenceLines: [{ y: 100 }] });
    fixture.detectChanges();

    const items = component.processedData();
    expect(items[0]?.heightPct).toContain('%');
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
});
