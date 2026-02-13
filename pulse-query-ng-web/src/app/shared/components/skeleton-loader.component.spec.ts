import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SkeletonLoaderComponent } from './skeleton-loader.component';
import { By } from '@angular/platform-browser';

describe('SkeletonLoaderComponent', () => {
  let component: SkeletonLoaderComponent;
  let fixture: ComponentFixture<SkeletonLoaderComponent>;
  let variantSig: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonLoaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonLoaderComponent);
    component = fixture.componentInstance;
    variantSig = signal('card');
    (component as any).variant = variantSig;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render generic card by default', () => {
    variantSig.set('card');
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.css('.layout-card'));
    expect(el).toBeTruthy();
  });

  it('should render table variant', () => {
    variantSig.set('table');
    fixture.detectChanges();

    const tableLayout = fixture.debugElement.query(By.css('.layout-table'));
    expect(tableLayout).toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('.table-row'));
    expect(rows.length).toBe(4);
  });

  it('should render metric variant', () => {
    variantSig.set('metric');
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.css('.metric-val'));
    expect(el).toBeTruthy();
  });

  it('should render chart variant', () => {
    variantSig.set('chart');
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.css('.layout-chart'));
    expect(el).toBeTruthy();
  });

  it('should render pie variant', () => {
    variantSig.set('pie');
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.css('.layout-pie'));
    expect(el).toBeTruthy();
  });
});
