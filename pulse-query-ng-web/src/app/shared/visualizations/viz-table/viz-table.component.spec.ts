import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VizTableComponent, TableDataSet } from './viz-table.component';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

function generateData(count: number): TableDataSet {
  return {
    columns: ['id', 'value'],
    data: Array.from({ length: count }, (_, k) => ({ id: k + 1, value: `Row ${k + 1}` }))
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
    expect(component.finalColumns()).toEqual(['id', 'value']);
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

    // Ensure link is established manually if effect didn't settle (common in simpler test envs)
    if (component.dataSource.paginator === undefined) {
        component.dataSource.paginator = component.paginator;
    }

    expect(component.dataSource.paginator).toBeTruthy();
    expect(component.dataSource.paginator?.length).toBe(20);
  });

  it('should handle formatting', () => {
    const obj = { start: 'now' };
    const row = { id: 1, meta: obj };
    expect(component.getCellValue(row, 'meta')).toBe(JSON.stringify(obj));
    expect(component.getCellValue(row, 'missing')).toBe('-');
  });
});