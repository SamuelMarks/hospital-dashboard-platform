import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { ScenarioEditorComponent } from './scenario-editor.component'; 
import { SimulationStore } from '../simulation.service'; 
import { signal } from '@angular/core'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { By } from '@angular/platform-browser'; 
import { VizChartComponent } from '../../shared/visualizations/viz-chart/viz-chart.component'; 
import { vi } from 'vitest';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xFFFFFFFF,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true
}));

describe('ScenarioEditorComponent', () => { 
  let component: ScenarioEditorComponent; 
  let fixture: ComponentFixture<ScenarioEditorComponent>; 
  let mockStore: any; 

  beforeEach(async () => { 
    // Mock Store updated to include 'constraints' signal required by template
    mockStore = { 
      capacityMap: signal({ 'ICU': 10 }), 
      demandSql: signal('SELECT 1'), 
      results: signal(null), 
      constraints: signal([]), // Added missing signal
      isRunning: signal(false), 
      error: signal(null), 
      updateCapacity: vi.fn(), 
      runScenario: vi.fn(), 
      addConstraint: vi.fn(), 
      removeConstraint: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [ScenarioEditorComponent, NoopAnimationsModule], 
      providers: [ 
        { provide: SimulationStore, useValue: mockStore } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(ScenarioEditorComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should render results with charts when data arrives', () => { 
    // Simulate API Response with Delta
    mockStore.results.set([ 
      { Service: 'Cardio', Unit: 'ICU', Patient_Count: 5, Original_Count: 0, Delta: 5 } 
    ]); 
    fixture.detectChanges(); 
    
    // Check Charts presence
    const charts = fixture.debugElement.queryAll(By.directive(VizChartComponent)); 
    expect(charts.length).toBe(2); // Allocation + Deviation
    
    // Check Table data mapping
    const tableData = component.tableData(); 
    expect(tableData?.columns).toContain('Delta'); 
    expect(tableData?.data[0]['Delta']).toBe(5); 
  }); 
});