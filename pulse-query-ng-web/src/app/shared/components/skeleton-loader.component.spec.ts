import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonLoaderComponent } from './skeleton-loader.component';
import { By } from '@angular/platform-browser';

describe('SkeletonLoaderComponent', () => {
  let component: SkeletonLoaderComponent;
  let fixture: ComponentFixture<SkeletonLoaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonLoaderComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonLoaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render generic card by default', () => {
    fixture.componentRef.setInput('variant', 'card');
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.css('.layout-card'));
    expect(el).toBeTruthy();
  });

  it('should render table variant', () => {
    fixture.componentRef.setInput('variant', 'table');
    fixture.detectChanges();
    
    const tableLayout = fixture.debugElement.query(By.css('.layout-table'));
    expect(tableLayout).toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('.table-row'));
    expect(rows.length).toBe(4);
  });

  it('should render metric variant', () => {
    fixture.componentRef.setInput('variant', 'metric');
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.css('.metric-val'));
    expect(el).toBeTruthy();
  });
});