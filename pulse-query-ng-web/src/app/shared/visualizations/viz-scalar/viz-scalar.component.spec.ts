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
   * Angular Material Tooltips (used in this component) rely on CDK BreakpointObserver.
   * JSDOM (used by Vitest) does not fully implement matchMedia, especially the deprecated 
   * `addListener` method which versions of CDK still fall back to.
   */
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // Required by CDK/Material legacy support
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
    
    expect(fixture.debugElement.query(By.css('.correlation-gauge'))).toBeFalsy(); 
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

    const gauge = fixture.debugElement.query(By.css('.correlation-gauge')); 
    expect(gauge).toBeTruthy(); 
    expect(gauge.attributes['role']).toBe('meter'); 

    const text = fixture.debugElement.query(By.css('.interpret-text')); 
    expect(text.nativeElement.textContent).toContain('Strong'); 
  }); 
});