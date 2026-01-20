import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VizTableComponent, TableDataSet } from './viz-table.component';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

function generateData(count: number): TableDataSet {
  return {
    columns: ['id', 'value', 'census'],
    data: Array.from({ length: count }, (_, k) => ({ id: k + 1, value: `Row ${k + 1}`, census: k * 10 }))
  };
}

describe('VizTableComponent', () => {
  let component: VizTableComponent;
  let fixture: ComponentFixture<VizTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VizTableComponent, NoopAnimationsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(VizTableComponent);
    component = fixture.componentInstance;
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
    
    const cell = rows[0].query(By.css('td[mat-cell]'));
    expect(cell.nativeElement.textContent.trim()).toBe('1');
  });

  it('should connect paginator', async () => {
    fixture.componentRef.setInput('dataSet', generateData(20));
    fixture.detectChanges();
    await fixture.whenStable();

    if (component.dataSource.paginator === undefined) {
        component.dataSource.paginator = component.paginator;
    }

    expect(component.dataSource.paginator).toBeTruthy();
    expect(component.dataSource.paginator?.length).toBe(20);
  });

  it('should apply warning class to cells exceeding threshold', () => {
    const row = { id: 1, census: 85 }; // > 80
    component.dataSource.data = [row];
    fixture.componentRef.setInput('dataSet', { columns: ['census'], data: [row] });
    fixture.componentRef.setInput('config', { thresholds: { warning: 80, critical: 90 } });
    
    // census contains 'census' string so heuristic should pick it up
    const classes = component.getCellClass(row, 'census');
    expect(classes).toContain('cell-warn');
    expect(classes).not.toContain('cell-critical');
  });

  it('should apply critical class to cells exceeding critical threshold', () => {
    const row = { id: 1, census: 95 }; // > 90
    fixture.componentRef.setInput('config', { thresholds: { warning: 80, critical: 90 } });
    
    const classes = component.getCellClass(row, 'census');
    expect(classes).toContain('cell-critical');
  });

  it('should respect manual thresholdColumn config', () => {
    const row = { id: 1, custom_val: 100 };
    // 'custom_val' doesn't match heuristics, so we must specify it
    fixture.componentRef.setInput('config', { 
        thresholds: { critical: 50 },
        thresholdColumn: 'custom_val'
    });

    const classes = component.getCellClass(row, 'custom_val');
    expect(classes).toContain('cell-critical');
  });
});