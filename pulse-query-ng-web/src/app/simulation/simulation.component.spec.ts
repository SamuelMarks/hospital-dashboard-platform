/**
 * @fileoverview Unit tests for `SimulationComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimulationComponent } from './simulation.component';
import { SimulationStore, UnitCapacity } from './simulation.store';
import { signal, NO_ERRORS_SCHEMA, Component, input, WritableSignal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { vi, describe, beforeEach, it, expect, type Mock } from 'vitest';
import {
  VizTableComponent,
  TableDataSet,
} from '../shared/visualizations/viz-table/viz-table.component';
import { readTemplate } from '../../test-utils/component-resources';
import { ActivatedRoute, Params } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'viz-table',
  template: '',
})
class MockVizTableComponent {
  readonly dataSet = input<unknown>();
  readonly config = input<unknown>();
}

interface MockSimulationStore {
  demandSql: WritableSignal<string>;
  capacityParams: WritableSignal<UnitCapacity[]>;
  isSimulating: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  results: WritableSignal<TableDataSet | null>;
  setDemandSql: Mock;
  addCapacityParam: Mock;
  updateCapacityParam: Mock;
  removeCapacityParam: Mock;
  runSimulation: Mock;
}

describe('SimulationComponent', () => {
  let component: SimulationComponent;
  let fixture: ComponentFixture<SimulationComponent>;
  let mockStore: MockSimulationStore;
  let queryParamsSubject: BehaviorSubject<Params>;

  beforeEach(async () => {
    queryParamsSubject = new BehaviorSubject<Params>({});

    mockStore = {
      demandSql: signal('SELECT 1'),
      capacityParams: signal([{ unit: 'ICU', capacity: 10 }]),
      isSimulating: signal(false),
      error: signal<string | null>(null),
      results: signal<TableDataSet | null>(null),
      setDemandSql: vi.fn(),
      addCapacityParam: vi.fn(),
      updateCapacityParam: vi.fn(),
      removeCapacityParam: vi.fn(),
      runSimulation: vi.fn(),
    };

    TestBed.overrideComponent(SimulationComponent, {
      remove: { imports: [VizTableComponent] },
      add: { imports: [MockVizTableComponent] },
    });

    TestBed.overrideComponent(SimulationComponent, {
      set: {
        providers: [{ provide: SimulationStore, useValue: mockStore }],
        schemas: [NO_ERRORS_SCHEMA],
        template: readTemplate('./simulation.component.html'),
        templateUrl: undefined,
      },
    });

    await TestBed.configureTestingModule({
      imports: [SimulationComponent, NoopAnimationsModule, ReactiveFormsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParams: queryParamsSubject.asObservable() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SimulationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and extract input event values', () => {
    expect(component).toBeTruthy();
    const fakeEvent = { target: { value: 'ICU_West' } } as unknown as Event;
    expect(component.getEventValue(fakeEvent)).toBe('ICU_West');
  });

  it('should initialize demand sql from query params', () => {
    queryParamsSubject.next({ sql: 'SELECT * FROM test' });
    expect(mockStore.setDemandSql).toHaveBeenCalledWith('SELECT * FROM test');
  });

  it('should trigger updateDemandSql', () => {
    component.updateDemandSql('SELECT 2');
    expect(mockStore.setDemandSql).toHaveBeenCalledWith('SELECT 2');
  });

  it('should add capacity param', () => {
    component.addCapacity();
    expect(mockStore.addCapacityParam).toHaveBeenCalled();
  });

  it('should update capacity param when index exists and ignore out-of-bounds index', () => {
    component.updateCapacity(0, 'unit', 'NewUnit');
    expect(mockStore.updateCapacityParam).toHaveBeenCalledWith(0, {
      unit: 'NewUnit',
      capacity: 10,
    });

    component.updateCapacity(0, 'capacity', 42);
    expect(mockStore.updateCapacityParam).toHaveBeenCalledWith(0, { unit: 'ICU', capacity: 42 });

    mockStore.updateCapacityParam.mockClear();
    component.updateCapacity(99, 'unit', 'Missing');
    expect(mockStore.updateCapacityParam).not.toHaveBeenCalled();
  });

  it('should remove capacity param', () => {
    component.removeCapacity(0);
    expect(mockStore.removeCapacityParam).toHaveBeenCalledWith(0);
  });

  it('should render results table when results exist', () => {
    mockStore.results.set({ columns: ['Service'], data: [{ Service: 'A' }] });
    fixture.detectChanges();
    const table = fixture.debugElement.query(By.css('viz-table'));
    expect(table).toBeTruthy();
  });

  it('should render error when error exists', () => {
    mockStore.error.set('Failed validation');
    fixture.detectChanges();
    const err = fixture.debugElement.query(By.css('.error-box'));
    expect(err).toBeTruthy();
    expect(err.nativeElement.textContent).toContain('Failed validation');
  });
});
