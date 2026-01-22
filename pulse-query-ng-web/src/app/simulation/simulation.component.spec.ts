/** 
 * @fileoverview Unit tests for SimulationComponent. 
 * Includes manual mocking of @material/material-color-utilities. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { SimulationComponent } from './simulation.component'; 
import { SimulationStore } from './simulation.store'; 
import { signal } from '@angular/core'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { MatSliderModule } from '@angular/material/slider'; 
import { By } from '@angular/platform-browser'; 
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

describe('SimulationComponent', () => { 
  let component: SimulationComponent; 
  let fixture: ComponentFixture<SimulationComponent>; 
  let mockStore: any; 

  beforeEach(async () => { 
    mockStore = { 
      isActive: signal(false), 
      params: signal({ users: 100, rate: 100, errorInjection: false, failureRate: 0, latencyInjection: false }), 
      metrics: signal({ activeConnections: 0, rps: 0, errorCount: 0, avgLatency: 0 }), 
      history: signal([]), 
      toggleSimulation: vi.fn(), 
      updateParams: vi.fn(), 
      reset: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [SimulationComponent, NoopAnimationsModule, MatSliderModule] 

    }).overrideComponent(SimulationComponent, { 
      set: { providers: [{ provide: SimulationStore, useValue: mockStore }] } 
    }).compileComponents(); 

    fixture = TestBed.createComponent(SimulationComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should toggle simulation via store', () => { 
    const btn = fixture.debugElement.query(By.css('button[mat-flat-button]')); 
    btn.triggerEventHandler('click', null); 
    expect(mockStore.toggleSimulation).toHaveBeenCalled(); 
  }); 

  it('should have accessible sliders', () => { 
    const sliderInput = fixture.debugElement.query(By.css('input[matSliderThumb]')); 
    expect(sliderInput).toBeTruthy(); 
    expect(sliderInput.attributes['aria-label']).toBeTruthy(); 
  }); 

  it('should compute chart data from history', () => { 
    mockStore.history.set([ 
      { timestamp: Date.now(), rps: 100, errors: 5 } 
    ]); 
    fixture.detectChanges(); 

    const d = component.chartData(); 
    expect(d.data.length).toBe(2); // 1 success row, 1 error row
    // Fix: Access property via bracket notation since it comes from Record<string, any>
    expect(d.data[1]['value']).toBe(5); 
  }); 
});