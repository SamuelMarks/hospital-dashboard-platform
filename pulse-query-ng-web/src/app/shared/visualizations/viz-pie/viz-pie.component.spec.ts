/** 
 * @fileoverview Unit tests for VizPieComponent. 
 * Includes manual mocking of @material/material-color-utilities to resolving import errors in JSDOM. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { signal, PLATFORM_ID } from '@angular/core';
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

describe('VizPieComponent', () => { 
  let component: import('./viz-pie.component').VizPieComponent; 
  let fixture: ComponentFixture<import('./viz-pie.component').VizPieComponent>; 
  let VizPieComponentCtor: typeof import('./viz-pie.component').VizPieComponent;
  let dataSetSig: any;
  let configSig: any;

  beforeEach(async () => { 
    const mod = await import('./viz-pie.component');
    VizPieComponentCtor = mod.VizPieComponent;

    await TestBed.configureTestingModule({ 
      imports: [VizPieComponentCtor] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(VizPieComponentCtor); 
    component = fixture.componentInstance; 
    dataSetSig = signal({ columns: [], data: [] });
    configSig = signal(undefined);
    (component as any).dataSet = dataSetSig;
    (component as any).config = configSig;
     
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
    dataSetSig.set(data); 
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
    dataSetSig.set(data); 
    fixture.detectChanges(); 

    const legendItem = fixture.debugElement.query(By.css('.legend-item')); 
    expect(legendItem).toBeTruthy(); 
    expect(legendItem.attributes['tabindex']).toBe('0'); 
    
    // Focus simulation
    legendItem.triggerEventHandler('focus', null); 
    fixture.detectChanges(); 
    expect(component.activeSlice()).toBe('A'); 
  }); 

  it('should clear active slice on mouseleave and blur', () => {
    const data = {
      columns: ['L', 'V'],
      data: [{ L: 'A', V: 50 }]
    };
    dataSetSig.set(data);
    fixture.detectChanges();

    const path = fixture.debugElement.query(By.css('path'));
    path.triggerEventHandler('mouseenter', null);
    expect(component.activeSlice()).toBe('A');
    path.triggerEventHandler('mouseleave', null);
    expect(component.activeSlice()).toBeNull();

    const legendItem = fixture.debugElement.query(By.css('.legend-item'));
    legendItem.triggerEventHandler('focus', null);
    expect(component.activeSlice()).toBe('A');
    legendItem.triggerEventHandler('blur', null);
    expect(component.activeSlice()).toBeNull();
  });

  it('should map labels and values using config', () => {
    const data = {
      columns: ['name', 'amount'],
      data: [{ name: 'X', amount: 100 }]
    };
    dataSetSig.set(data);
    configSig.set({ xKey: 'name', yKey: 'amount' });
    fixture.detectChanges();

    const slices = component.slices();
    expect(slices[0].label).toBe('X');
    expect(slices[0].percentage).toBe(100);
  });

  it('should render full circle for single slice', () => {
    const data = {
      columns: ['L', 'V'],
      data: [{ L: 'Only', V: 100 }]
    };
    dataSetSig.set(data);
    fixture.detectChanges();

    const slice = component.slices()[0];
    expect(slice.path).toContain('A 1 1 0 1 1');
  });

  it('should mark slices active/inactive', () => {
    component.activeSlice.set('A');
    expect(component.isActive('A')).toBe(true);
    expect(component.isActive('B')).toBe(false);
  });

  it('should provide accessibility label', () => {
    const data = {
      columns: ['L', 'V'],
      data: [{ L: 'A', V: 50 }]
    };
    dataSetSig.set(data);
    fixture.detectChanges();
    expect(component.accessibilityLabel()).toContain('slices');
  });

  it('should treat all slices active when none selected', () => {
    component.activeSlice.set(null);
    expect(component.isActive('Any')).toBe(true);
  });

  it('should fallback to single column for values', () => {
    const data = {
      columns: ['Only'],
      data: [{ Only: 10 }]
    };
    dataSetSig.set(data);
    fixture.detectChanges();

    const slice = component.slices()[0];
    expect(slice.label).toBe('10');
    expect(slice.percentage).toBe(100);
  });

  it('should clamp negative values to zero in totals', () => {
    const data = {
      columns: ['L', 'V'],
      data: [{ L: 'A', V: -5 }, { L: 'B', V: 0 }]
    };
    dataSetSig.set(data);
    fixture.detectChanges();

    const slices = component.slices();
    expect(slices[0].percentage).toBe(0);
  });

  it('should no-op palette update when document missing', () => {
    (component as any).document = null;
    (component as any).updatePaletteFomDom();
    expect(component['palette']()).toBeTruthy();
  });
  
  it('should skip palette update when platform is not browser', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VizPieComponentCtor],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }]
    }).compileComponents();

    const serverFixture = TestBed.createComponent(VizPieComponentCtor);
    const serverComponent = serverFixture.componentInstance;
    (serverComponent as any).dataSet = signal({ columns: [], data: [] });
    (serverComponent as any).config = signal(undefined);
    const updateSpy = vi.spyOn(serverComponent as any, 'updatePaletteFomDom');
    serverFixture.detectChanges();

    expect(updateSpy).not.toHaveBeenCalled();
  });
});
