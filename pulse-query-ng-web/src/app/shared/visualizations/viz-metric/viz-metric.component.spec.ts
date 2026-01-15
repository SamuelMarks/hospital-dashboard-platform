/**
 * @fileoverview Unit tests for VizMetricComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { VizMetricComponent } from './viz-metric.component'; 
import { By } from '@angular/platform-browser'; 

describe('VizMetricComponent', () => { 
  let component: VizMetricComponent; 
  let fixture: ComponentFixture<VizMetricComponent>; 

  beforeEach(async () => { 
    await TestBed.configureTestingModule({ 
      imports: [VizMetricComponent] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizMetricComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should display primitive values correctly', () => { 
    fixture.componentRef.setInput('data', 42); 
    fixture.detectChanges(); 
    const valueEl = fixture.debugElement.query(By.css('.metric-value')); 
    expect(valueEl.nativeElement.textContent.trim()).toBe('42'); 
  }); 

  it('should fallback to dash', () => { 
    fixture.componentRef.setInput('data', null); 
    fixture.detectChanges(); 
    const valueEl = fixture.debugElement.query(By.css('.metric-value')); 
    expect(valueEl.nativeElement.textContent.trim()).toBe('-'); 
  }); 

  it('should extract value from object structure', () => { 
    fixture.componentRef.setInput('data', { value: 99, label: 'Test' }); 
    fixture.detectChanges(); 
    
    const valueEl = fixture.debugElement.query(By.css('.metric-value')); 
    expect(valueEl.nativeElement.textContent.trim()).toBe('99'); 
  });
});