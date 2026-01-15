/**
 * @fileoverview Unit tests for WidgetComponent.
 * Verifies host binding interaction, visualization switching, and loading states.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetComponent } from './widget.component';
import { DashboardStore } from '../dashboard/dashboard.store';
import { WidgetResponse } from '../api-client';
import { signal, WritableSignal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { VizTableComponent } from '../shared/visualizations/viz-table/viz-table.component'; 
import { VizMetricComponent } from '../shared/visualizations/viz-metric/viz-metric.component'; 

describe('WidgetComponent', () => { 
  let component: WidgetComponent; 
  let fixture: ComponentFixture<WidgetComponent>; 
  
  let dataMapSig: WritableSignal<Record<string, any>>; 
  let isLoadingSig: WritableSignal<boolean>; 

  const mockWidget: WidgetResponse = { 
    id: 'w1', dashboard_id: 'd1', title: 'Test Widget', type: 'SQL', visualization: 'table', config: { query: 'SELECT 1' } 
  }; 

  let mockStore: any; 

  beforeEach(async () => { 
    dataMapSig = signal({}); 
    isLoadingSig = signal(false); 
    
    mockStore = { 
      dataMap: dataMapSig, 
      isLoading: isLoadingSig, 
      isWidgetLoading: signal(() => false), 
      refreshWidget: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [WidgetComponent, NoopAnimationsModule], 
      providers: [{ provide: DashboardStore, useValue: mockStore }] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(WidgetComponent); 
    component = fixture.componentInstance; 
    fixture.componentRef.setInput('widget', mockWidget); 
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should render title inside mat-card-header', () => { 
    const titleEl = fixture.debugElement.query(By.css('mat-card-header span')); 
    expect(titleEl.nativeElement.textContent).toContain('Test Widget'); 
  }); 

  it('should handle keyboard escape event via host mapping', () => {
    // Spy on delete emitter
    let deleteEmitted = false;
    component.delete.subscribe(() => deleteEmitted = true);

    // Trigger on host element
    const hostEl = fixture.debugElement;
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    vi.spyOn(event, 'stopPropagation');

    hostEl.nativeElement.dispatchEvent(event);
    
    // Check if onEscape() was called and propagated to emit
    expect(deleteEmitted).toBe(true);
  });

  it('should render VizTable when visualization is "table"', () => { 
    dataMapSig.set({ 'w1': { columns: ['a'], data: [{a: 1}] } }); 
    fixture.detectChanges(); 

    const viz = fixture.debugElement.query(By.directive(VizTableComponent)); 
    expect(viz).toBeTruthy(); 
  }); 

  it('should render VizMetric when visualization is "metric"', () => { 
    fixture.componentRef.setInput('widget', { ...mockWidget, visualization: 'metric' }); 
    dataMapSig.set({ 'w1': { value: 100 } }); 
    fixture.detectChanges(); 

    const viz = fixture.debugElement.query(By.directive(VizMetricComponent)); 
    expect(viz).toBeTruthy(); 
  }); 
});