import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScenarioEditorComponent } from './scenario-editor.component';
import { SimulationStore } from '../simulation.service';
import { signal, NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { vi } from 'vitest';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

describe('ScenarioEditorComponent', () => {
  let component: ScenarioEditorComponent;
  let fixture: ComponentFixture<ScenarioEditorComponent>;
  let mockStore: any;

  beforeEach(async () => {
    // Mock Store updated to include 'constraints' signal required by template
    mockStore = {
      capacityMap: signal({ ICU: 10 }),
      demandSql: signal('SELECT 1'),
      results: signal(null),
      constraints: signal([]), // Added missing signal
      isRunning: signal(false),
      error: signal(null),
      updateCapacity: vi.fn(),
      runScenario: vi.fn(),
      addConstraint: vi.fn(),
      removeConstraint: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ScenarioEditorComponent, NoopAnimationsModule],
      providers: [{ provide: SimulationStore, useValue: mockStore }],
    })
      .overrideComponent(ScenarioEditorComponent, {
        set: { template: '<div></div>', schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ScenarioEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should render results with charts when data arrives', () => {
    // Simulate API Response with Delta
    mockStore.results.set([
      { Service: 'Cardio', Unit: 'ICU', Patient_Count: 5, Original_Count: 0, Delta: 5 },
    ]);
    fixture.detectChanges();

    expect(component.allocationData()).toBeTruthy();
    expect(component.deviationData()).toBeTruthy();

    // Check Table data mapping
    const tableData = component.tableData();
    expect(tableData?.columns).toContain('Delta');
    expect(tableData?.data[0]['Delta']).toBe(5);
  });

  it('should compute empty projections when results are null', () => {
    mockStore.results.set(null);
    fixture.detectChanges();
    expect(component.tableData()).toBeNull();
    expect(component.allocationData()).toBeNull();
    expect(component.deviationData()).toBeNull();
    expect(component.totalAllocated()).toBe('0');
  });

  it('should compute allocation and deviation data', () => {
    mockStore.results.set([
      { Service: 'A', Unit: 'ICU', Patient_Count: 5, Original_Count: 0, Delta: 0 },
      { Service: 'B', Unit: 'ER', Patient_Count: 3, Original_Count: 0, Delta: 2 },
    ]);
    fixture.detectChanges();

    expect(component.allocationData()?.data.length).toBe(2);
    expect(component.deviationData()?.data.length).toBe(1);
  });

  it('should sort by absolute delta and handle non-numeric counts', () => {
    mockStore.results.set([
      { Service: 'A', Unit: 'ICU', Patient_Count: '3', Original_Count: 0, Delta: -5 },
      { Service: 'B', Unit: 'ER', Patient_Count: undefined, Original_Count: 0, Delta: 2 },
      { Service: 'C', Unit: 'Ward', Patient_Count: 1, Original_Count: 0 },
    ]);
    fixture.detectChanges();

    const table = component.tableData();
    expect(table?.data[0]['Service']).toBe('A');
    expect(component.totalAllocated()).toBe('4'); // 3 + 0 + 1

    const deviation = component.deviationData();
    expect(deviation?.data.length).toBe(2);
  });

  it('should handle results when delta values are missing', () => {
    mockStore.results.set([
      { Service: 'A', Unit: 'ICU', Patient_Count: 1, Original_Count: 0 },
      { Service: 'B', Unit: 'ER', Patient_Count: 2, Original_Count: 0 },
    ]);
    fixture.detectChanges();

    expect(component.tableData()?.data.length).toBe(2);
  });

  it('should expose units and sort with missing delta values', () => {
    mockStore.capacityMap.set({ ICU: 10, ER: 5 });
    mockStore.results.set([
      { Service: 'A', Unit: 'ICU', Patient_Count: 1, Original_Count: 0, Delta: undefined },
      { Service: 'B', Unit: 'ER', Patient_Count: 2, Original_Count: 0, Delta: 2 },
    ]);
    fixture.detectChanges();

    expect(component.units()).toEqual(['ICU', 'ER']);
    expect(component.tableData()?.data.length).toBe(2);
  });

  it('should proxy capacity and constraints actions', () => {
    expect(component.getCapacity('ICU')).toBe(10);
    component.setCapacity('ICU', 20);
    expect(mockStore.updateCapacity).toHaveBeenCalledWith('ICU', 20);

    component.addConstraint();
    expect(mockStore.addConstraint).toHaveBeenCalled();

    component.removeConstraint(0);
    expect(mockStore.removeConstraint).toHaveBeenCalledWith(0);
  });
});
