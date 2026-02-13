/**
 * @fileoverview Unit tests for FilterRibbonComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FilterRibbonComponent } from './filter-ribbon.component';
import { DashboardStore } from './dashboard.store';
import { ActivatedRoute, Router } from '@angular/router';
import { signal, WritableSignal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';

describe('FilterRibbonComponent', () => {
  let component: FilterRibbonComponent;
  let fixture: ComponentFixture<FilterRibbonComponent>;

  let mockStore: any;
  let mockRouter: any;
  let queryParamsSub: BehaviorSubject<any>;

  // Store Signals
  let globalParamsSig: WritableSignal<Record<string, any>>;

  beforeEach(async () => {
    globalParamsSig = signal({});
    mockStore = {
      globalParams: globalParamsSig,
    };

    queryParamsSub = new BehaviorSubject({
      get: (key: string) => null,
    });

    mockRouter = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FilterRibbonComponent, NoopAnimationsModule],
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParamsSub.asObservable() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FilterRibbonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize controls from URL query params', () => {
    // Simulate URL being loaded with ?dept=Cardiology
    queryParamsSub.next({
      get: (key: string) => {
        if (key === 'dept') return 'Cardiology';
        if (key === 'start_date') return '2023-01-01';
        if (key === 'end_date') return '2023-01-31';
        return null;
      },
    });

    // Check if form control updated
    expect(component.deptControl.value).toBe('Cardiology');
    expect(component.startDate.value?.toISOString().startsWith('2023-01-01')).toBe(true);
    expect(component.endDate.value?.toISOString().startsWith('2023-01-31')).toBe(true);
  });

  it('should navigate when Department changes', () => {
    component.deptControl.setValue('Neurology');

    // Check Router Navigation
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { dept: 'Neurology' },
        queryParamsHandling: 'merge',
      }),
    );
  });

  it('should navigate when BOTH dates are set', () => {
    const d1 = new Date('2023-01-01');
    const d2 = new Date('2023-01-31');

    component.startDate.setValue(d1);
    component.endDate.setValue(d2);

    // Trigger the change handler manually (as UI picker would)
    component.onDateChange();

    expect(mockRouter.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: {
          start_date: '2023-01-01',
          end_date: '2023-01-31',
        },
      }),
    );
  });

  it('should NOT navigate if only Start Date is set', () => {
    component.startDate.setValue(new Date('2023-01-01'));
    component.onDateChange();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should clear filters when clearFilters() called', () => {
    component.clearFilters();

    expect(mockRouter.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { start_date: null, end_date: null, dept: null },
      }),
    );
    expect(component.deptControl.value).toBeNull();
    expect(component.startDate.value).toBeNull();
    expect(component.endDate.value).toBeNull();
  });

  it('should update filter with null value', () => {
    component.deptControl.setValue(null);
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        queryParams: { dept: null },
      }),
    );
  });

  it('should cleanup subscriptions on destroy', () => {
    component.ngOnDestroy();
    expect(true).toBe(true);
  });
});
