/** 
 * @fileoverview Unit tests for VizHeatmapComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { VizHeatmapComponent } from './viz-heatmap.component'; 
import { By } from '@angular/platform-browser'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 

describe('VizHeatmapComponent', () => { 
  let component: VizHeatmapComponent; 
  let fixture: ComponentFixture<VizHeatmapComponent>; 

  beforeEach(async () => { 
    await TestBed.configureTestingModule({ 
      imports: [VizHeatmapComponent, NoopAnimationsModule] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizHeatmapComponent); 
    component = fixture.componentInstance; 
    
    // FIX: Set required input BEFORE first Change Detection
    fixture.componentRef.setInput('dataSet', { columns: [], data: [] });
    
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should render grid based on data', () => { 
    const data = { 
      columns: ['svc', 'hr', 'val'], 
      data: [ 
        { svc: 'A', hr: 1, val: 10 }, 
        { svc: 'A', hr: 2, val: 20 }, 
        { svc: 'B', hr: 1, val: 5 }, 
        { svc: 'B', hr: 2, val: 15 } 
      ] 
    }; 
    fixture.componentRef.setInput('dataSet', data); 
    fixture.detectChanges(); 

    // Grid Container Check
    const container = fixture.debugElement.query(By.css('.heatmap-container')); 
    expect(container).toBeTruthy(); 
    expect(container.attributes['role']).toBe('grid'); 

    const cells = fixture.debugElement.queryAll(By.css('.cell')); 
    expect(cells.length).toBe(4); 
    
    // Check Tooltips exist
    expect(cells[0].attributes['aria-label']).toContain('10'); 
  }); 
});