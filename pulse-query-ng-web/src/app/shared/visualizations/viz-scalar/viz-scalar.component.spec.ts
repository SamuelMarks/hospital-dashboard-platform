/** 
 * @fileoverview Unit tests for VizScalarComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { VizScalarComponent } from './viz-scalar.component'; 
import { By } from '@angular/platform-browser'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { vi } from 'vitest'; 

describe('VizScalarComponent', () => { 
  let component: VizScalarComponent; 
  let fixture: ComponentFixture<VizScalarComponent>; 

  /** 
   * Fix for "TypeError: mql.addListener is not a function" on CI. 
   */ 
  beforeAll(() => { 
    Object.defineProperty(window, 'matchMedia', { 
      writable: true, 
      value: vi.fn().mockImplementation((query: string) => ({ 
        matches: false, 
        media: query, 
        onchange: null, 
        addListener: vi.fn(), 
        removeListener: vi.fn(), 
        addEventListener: vi.fn(), 
        removeEventListener: vi.fn(), 
        dispatchEvent: vi.fn(), 
      })), 
    }); 
  }); 

  beforeEach(async () => { 
    await TestBed.configureTestingModule({ 
      imports: [VizScalarComponent, NoopAnimationsModule] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizScalarComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should display simple number', () => { 
    const data = { data: [{ val: 1000 }] }; 
    fixture.componentRef.setInput('data', data); 
    fixture.detectChanges(); 

    const valEl = fixture.debugElement.query(By.css('.value-display')); 
    expect(valEl.nativeElement.textContent).toBe('1,000'); 
    
    // MatProgressBar should NOT be present
    expect(fixture.debugElement.query(By.css('mat-progress-bar'))).toBeFalsy(); 
  }); 

  it('should display correlation context', () => { 
    const data = { 
        columns: ['correlation_coef'], 
        data: [{ correlation_coef: 0.85 }] 
    }; 
    fixture.componentRef.setInput('data', data); 
    fixture.detectChanges(); 

    const valEl = fixture.debugElement.query(By.css('.value-display')); 
    expect(valEl.nativeElement.textContent).toBe('0.85'); 

    // Query for the material component directly as internal class logic might vary
    const gauge = fixture.debugElement.query(By.css('mat-progress-bar')); 
    expect(gauge).toBeTruthy(); 
    expect(gauge.attributes['role']).toBe('meter'); 

    const text = fixture.debugElement.query(By.css('.interpret-text')); 
    expect(text.nativeElement.textContent).toContain('Strong'); 
  }); 
});