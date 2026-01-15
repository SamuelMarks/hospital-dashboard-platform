/** 
 * @fileoverview Unit tests for VizPieComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { VizPieComponent } from './viz-pie.component'; 
import { By } from '@angular/platform-browser'; 

describe('VizPieComponent', () => { 
  let component: VizPieComponent; 
  let fixture: ComponentFixture<VizPieComponent>; 

  beforeEach(async () => { 
    await TestBed.configureTestingModule({ 
      imports: [VizPieComponent] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizPieComponent); 
    component = fixture.componentInstance; 
    
    // Initialize required inputs before first Change Detection
    // This prevents NG0950 error
    fixture.componentRef.setInput('dataSet', { columns: [], data: [] });
    
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should calculate paths correctly', () => { 
    const data = { 
        columns: ['L', 'V'], 
        data: [{ L: 'A', V: 50 }, { L: 'B', V: 50 }] 
    }; 
    fixture.componentRef.setInput('dataSet', data); 
    fixture.detectChanges(); 

    const slices = component.slices(); 
    expect(slices.length).toBe(2); 
    expect(slices[0].percentage).toBe(50); 
    
    // Check SVG generation
    const paths = fixture.debugElement.queryAll(By.css('path')); 
    expect(paths.length).toBe(2); 
  }); 

  it('should render keyboard accessible legend', () => { 
    const data = { 
        columns: ['L', 'V'], 
        data: [{ L: 'A', V: 50 }] 
    }; 
    fixture.componentRef.setInput('dataSet', data); 
    fixture.detectChanges(); 

    const legendItem = fixture.debugElement.query(By.css('.legend-item')); 
    expect(legendItem).toBeTruthy(); 
    expect(legendItem.attributes['tabindex']).toBe('0'); 
    
    // Focus simulation
    legendItem.triggerEventHandler('focus', null); 
    fixture.detectChanges(); 
    expect(component.activeSlice()).toBe('A'); 
  }); 
});