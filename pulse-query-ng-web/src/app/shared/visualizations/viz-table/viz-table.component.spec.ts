/**
 * @fileoverview Unit tests for VizTableComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VizTableComponent, TableDataSet } from './viz-table.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

/**
 * Generates a synthetic `TableDataSet` with the requested number of rows.
 *
 * @param count - Number of rows to generate.
 * @returns Generated `TableDataSet` fixture.
 */
function generateData(count: number): TableDataSet {
  return {
    columns: ['id', 'value', 'census'],
    data: Array.from({ length: count }, (_, k) => ({
      id: k + 1,
      value: `Row ${k + 1}`,
      census: k * 10,
    })),
  };
}

describe('VizTableComponent', () => {
  let component: VizTableComponent;
  let fixture: ComponentFixture<VizTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(VizTableComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('dataSet', undefined);
    fixture.componentRef.setInput('config', null);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render properties into DataSource via effect', () => {
    const mockData = generateData(5);
    fixture.componentRef.setInput('dataSet', mockData);
    fixture.detectChanges();

    expect(component.dataSource.data.length).toBe(5);
    expect(component.finalColumns()).toEqual(['id', 'value', 'census']);
  });

  it('should render mat-table rows', () => {
    fixture.componentRef.setInput('dataSet', generateData(3));
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tr[mat-row]'));
    expect(rows.length).toBe(3);

    const cell = rows[0]?.query(By.css('td[mat-cell]')).nativeElement as HTMLElement | undefined;
    expect(cell?.textContent?.trim()).toBe('1');
  });

  it('should connect paginator', async () => {
    fixture.componentRef.setInput('dataSet', generateData(20));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.dataSource.paginator).toBeTruthy();
    expect(component.dataSource.paginator?.length).toBe(20);
  });

  it('should assign paginator via effect when available', async () => {
    fixture.componentRef.setInput('dataSet', generateData(1));
    fixture.detectChanges();
    await fixture.whenStable();

    const paginator = component.paginator();
    fixture.componentRef.setInput('dataSet', generateData(2));
    fixture.detectChanges();

    expect(component.dataSource.paginator).toBe(paginator);
  });

  it('should skip paginator assignment when paginator is missing', () => {
    vi.spyOn(component, 'paginator').mockReturnValue(undefined);
    component.dataSource.paginator = null;
    fixture.componentRef.setInput('dataSet', generateData(2));
    fixture.detectChanges();
    expect(component.dataSource.paginator).toBeNull();
  });

  it('should apply warning class to cells exceeding threshold', () => {
    const row = { id: 1, census: 85 };
    component.dataSource.data = [row];
    fixture.componentRef.setInput('dataSet', { columns: ['census'], data: [row] });
    fixture.componentRef.setInput('config', { thresholds: { warning: 80, critical: 90 } });

    const classes = component.getCellClass(row, 'census');
    expect(classes).toContain('cell-warn');
    expect(classes).not.toContain('cell-critical');
  });

  it('should apply warning class when only warning threshold is configured', () => {
    const row = { id: 1, census: 60 };
    fixture.componentRef.setInput('config', { thresholds: { warning: 50 } });

    const classes = component.getCellClass(row, 'census');
    expect(classes).toContain('cell-warn');
  });

  it('should not apply threshold classes when value is below warning', () => {
    const row = { id: 1, census: 10 };
    fixture.componentRef.setInput('config', { thresholds: { warning: 50, critical: 90 } });

    const classes = component.getCellClass(row, 'census');
    expect(classes).not.toContain('cell-warn');
    expect(classes).not.toContain('cell-critical');
  });

  it('should apply critical class to cells exceeding critical threshold', () => {
    const row = { id: 1, census: 95 };
    fixture.componentRef.setInput('config', { thresholds: { warning: 80, critical: 90 } });

    const classes = component.getCellClass(row, 'census');
    expect(classes).toContain('cell-critical');
  });

  it('should respect manual thresholdColumn config', () => {
    const row = { id: 1, custom_val: 100 };
    fixture.componentRef.setInput('config', {
      thresholds: { critical: 50 },
      thresholdColumn: 'custom_val',
    });

    const classes = component.getCellClass(row, 'custom_val');
    expect(classes).toContain('cell-critical');
  });

  it('should format cell values correctly', () => {
    expect(component.showPaginator()).toBe(false);
    expect(component.formatHeaderLabel('avg_los_days')).toBe('avg los days');
    expect(component.getCellValue({ a: null }, 'a')).toBe('-');
    expect(component.getCellValue({ a: { x: 1 } }, 'a')).toContain('"x":1');
    expect(component.getCellValue({ a: 3.14159 }, 'a')).toBe('3.14');
    expect(component.getCellValue({ delta: 5 }, 'delta')).toBe('+5');
    expect(component.getCellValue({ delta: -3 }, 'delta')).toBe('-3');
    expect(component.getCellValue({ name: 'Cardiology' }, 'name')).toBe('Cardiology');
  });

  it('should apply delta classes for positive and negative values', () => {
    const pos = component.getCellClass({ delta: 1 }, 'delta');
    const neg = component.getCellClass({ delta: -1 }, 'delta');
    expect(pos).toContain('val-pos');
    expect(neg).toContain('val-neg');
  });

  it('should return empty classes when no thresholds apply', () => {
    const classes = component.getCellClass({ name: 'foo' }, 'name');
    expect(classes).toBe('');
    expect(component.getCellAriaLabel({ name: 'foo' }, 'name')).toBeNull();
  });

  it('should return localized aria-label for warning and critical threshold cells', () => {
    fixture.componentRef.setInput('config', { thresholds: { warning: 80, critical: 90 } });
    expect(component.getCellAriaLabel({ census: 85 }, 'census')).toBe('Warning: 85');
    expect(component.getCellAriaLabel({ census: 95 }, 'census')).toBe('Critical: 95');
  });
});
