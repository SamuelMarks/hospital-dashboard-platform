/**
 * @fileoverview Unit tests for SkeletonLoaderComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonLoaderComponent, SkeletonVariant } from './skeleton-loader.component';
import { By } from '@angular/platform-browser';

describe('SkeletonLoaderComponent', () => {
  let component: SkeletonLoaderComponent;
  let fixture: ComponentFixture<SkeletonLoaderComponent>;

  const setVariant = (variant: SkeletonVariant): void => {
    fixture.componentRef.setInput('variant', variant);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonLoaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonLoaderComponent);
    component = fixture.componentInstance;
    setVariant('card');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render generic card by default', () => {
    setVariant('card');
    const el = fixture.debugElement.query(By.css('.layout-card'));
    expect(el).toBeTruthy();
  });

  it('should render table variant', () => {
    setVariant('table');

    const tableLayout = fixture.debugElement.query(By.css('.layout-table'));
    expect(tableLayout).toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('.table-row'));
    expect(rows.length).toBe(4);
  });

  it('should render metric variant', () => {
    setVariant('metric');
    const el = fixture.debugElement.query(By.css('.metric-val'));
    expect(el).toBeTruthy();
  });

  it('should render chart variant', () => {
    setVariant('chart');
    const el = fixture.debugElement.query(By.css('.layout-chart'));
    expect(el).toBeTruthy();
  });

  it('should render pie variant', () => {
    setVariant('pie');
    const el = fixture.debugElement.query(By.css('.layout-pie'));
    expect(el).toBeTruthy();
  });

  it('should render heatmap, list, and dashboard-grid variants', () => {
    setVariant('heatmap');
    expect(fixture.debugElement.query(By.css('.layout-heatmap'))).toBeTruthy();

    setVariant('list');
    expect(fixture.debugElement.query(By.css('.layout-list'))).toBeTruthy();

    setVariant('dashboard-grid');
    expect(fixture.debugElement.query(By.css('.layout-dashboard-grid'))).toBeTruthy();
  });
});
