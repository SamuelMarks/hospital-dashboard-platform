/** 
 * @fileoverview Unit tests for VizHeatmapComponent. 
 * Verifies heatmap grid generation, tooltip responsiveness, and data mapping logic. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { signal } from '@angular/core';
import { VizHeatmapComponent } from './viz-heatmap.component'; 
import { By } from '@angular/platform-browser'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { vi } from 'vitest'; 

/** 
 * Test suite for the Heatmap Visualization. 
 */ 
describe('VizHeatmapComponent', () => { 
  let component: VizHeatmapComponent; 
  let fixture: ComponentFixture<VizHeatmapComponent>; 
  let dataSetSig: any;

  /** 
   * Setup global browser mocks for Material components. 
   * Patches `window.matchMedia` to support CDK BreakpointObserver used by MatTooltip. 
   * This logic is required for JSDOM environments that lack full media query support, 
   * specifically providing the deprecated `addListener` method which some CDK versions check for. 
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

  /** 
   * Configure the testing module. 
   */ 
  beforeEach(async () => { 
    await TestBed.configureTestingModule({ 
      imports: [VizHeatmapComponent, NoopAnimationsModule] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizHeatmapComponent); 
    component = fixture.componentInstance; 
    dataSetSig = signal({ columns: [], data: [] });
    (component as any).dataSet = dataSetSig;
    fixture.detectChanges(); 
  }); 

  /** 
   * Test instantiation. 
   */ 
  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  /** 
   * Test grid structure rendering. 
   */ 
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
    dataSetSig.set(data); 
    fixture.detectChanges(); 

    // Grid Container Check 
    const container = fixture.debugElement.query(By.css('.heatmap-container')); 
    expect(container).toBeTruthy(); 
    expect(container.attributes['role']).toBe('grid'); 

    const cells = fixture.debugElement.queryAll(By.css('.cell')); 
    expect(cells.length).toBe(4); 
    
    // Check Tooltips exist 
    // Note: Tooltip text is in aria-label for accessibility 
    expect(cells[0].attributes['aria-label']).toContain('10'); 
  }); 

  it('should render empty state when no data', () => {
    dataSetSig.set({ columns: [], data: [] });
    fixture.detectChanges();
    const empty = fixture.debugElement.query(By.css('.flex.items-center'));
    expect(empty).toBeTruthy();
  });

  it('should compute min/max and tooltips with negative values', () => {
    const data = {
      columns: ['svc', 'hr', 'val'],
      data: [
        { svc: 'A', hr: 1, val: -5 },
        { svc: 'A', hr: 2, val: 0 }
      ]
    };
    dataSetSig.set(data);
    fixture.detectChanges();

    const m = component.matrix();
    expect(m?.min).toBe(-5);
    expect(m?.max).toBe(0);
    expect(component.getCellTooltip(m, '1', 'A')).toContain('-5');
  });

  it('should use fallback range when all values equal', () => {
    const data = {
      columns: ['svc', 'hr', 'val'],
      data: [{ svc: 'A', hr: 1, val: 0 }]
    };
    dataSetSig.set(data);
    fixture.detectChanges();

    const m = component.matrix();
    const color = component.getCellColor(m, '1', 'A');
    expect(color).toContain('rgba');
  });
});
