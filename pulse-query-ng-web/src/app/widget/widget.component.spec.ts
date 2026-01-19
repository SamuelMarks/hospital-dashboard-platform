/** 
 * @fileoverview Unit tests for WidgetComponent. 
 * Verifies host binding interaction, visualization switching, loading states, and focus togglin. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { WidgetComponent } from './widget.component'; 
import { DashboardStore } from '../dashboard/dashboard.store'; 
import { WidgetResponse } from '../api-client'; 
import { signal, WritableSignal } from '@angular/core'; 
import { By } from '@angular/platform-browser'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 

import { VizTableComponent } from '../shared/visualizations/viz-table/viz-table.component'; 

describe('WidgetComponent', () => { 
  let component: WidgetComponent; 
  let fixture: ComponentFixture<WidgetComponent>; 
  
  let dataMapSig: WritableSignal<Record<string, any>>; 
  let isLoadingSig: WritableSignal<boolean>; 
  let isEditModeSig: WritableSignal<boolean>; 
  let focusedWidgetIdSig: WritableSignal<string | null>; 

  const mockWidget: WidgetResponse = { 
    id: 'w1', dashboard_id: 'd1', title: 'Test Widget', type: 'SQL', visualization: 'table', config: { query: 'SELECT 1' } 
  }; 

  let mockStore: any; 

  beforeEach(async () => { 
    dataMapSig = signal({}); 
    isLoadingSig = signal(false); 
    isEditModeSig = signal(false); 
    focusedWidgetIdSig = signal(null); 
    
    mockStore = { 
      dataMap: dataMapSig, 
      isLoading: isLoadingSig, 
      isEditMode: isEditModeSig, 
      focusedWidgetId: focusedWidgetIdSig, 
      isWidgetLoading: signal(() => false), 
      refreshWidget: vi.fn(), 
      setFocusedWidget: vi.fn(), 
      duplicateWidget: vi.fn() // Now supported
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

  it('should hidden config buttons in Read-Only Mode (default)', () => { 
    isEditModeSig.set(false); 
    fixture.detectChanges(); 
    
    expect(fixture.debugElement.query(By.css('[data-testid="btn-edit"]'))).toBeFalsy(); 
    expect(fixture.debugElement.query(By.css('[data-testid="btn-delete"]'))).toBeFalsy(); 
    expect(fixture.debugElement.query(By.css('[data-testid="btn-duplicate"]'))).toBeFalsy(); 
  }); 

  it('should show config buttons in Edit Mode', () => { 
    isEditModeSig.set(true); 
    fixture.detectChanges(); 
    
    expect(fixture.debugElement.query(By.css('[data-testid="btn-edit"]'))).toBeTruthy(); 
    expect(fixture.debugElement.query(By.css('[data-testid="btn-delete"]'))).toBeTruthy(); 
    expect(fixture.debugElement.query(By.css('[data-testid="btn-duplicate"]'))).toBeTruthy(); 
  }); 

  it('should emit duplicate event when clicked', () => { 
    isEditModeSig.set(true); 
    fixture.detectChanges(); 
    
    let emitted = false; 
    component.duplicate.subscribe(() => emitted = true); 

    const btn = fixture.debugElement.query(By.css('[data-testid="btn-duplicate"]')); 
    btn.triggerEventHandler('click', null); 
    
    expect(emitted).toBe(true); 
  }); 

  it('should render In-Place Error Recovery button when error active', () => { 
    // Setup Error State in Store
    dataMapSig.set({ 'w1': { error: 'Syntax Error in SQL' } }); 
    isEditModeSig.set(true); 
    fixture.detectChanges(); 

    const errorState = fixture.debugElement.query(By.css('[data-testid="error-state"]')); 
    expect(errorState).toBeTruthy(); 
    expect(errorState.nativeElement.textContent).toContain('Syntax Error'); 

    // Check Button
    const fixBtn = fixture.debugElement.query(By.css('[data-testid="btn-fix-query"]')); 
    expect(fixBtn).toBeTruthy(); 
    
    // Verify Action
    let editEmitted = false; 
    component.edit.subscribe(() => editEmitted = true); 
    fixBtn.triggerEventHandler('click', null); 
    expect(editEmitted).toBe(true); 
  }); 

  it('should handle keyboard escape event logic', () => { 
    let deleteEmitted = false; 
    component.delete.subscribe(() => deleteEmitted = true); 

    const event = new KeyboardEvent('keydown', { key: 'Escape' }); 
    vi.spyOn(event, 'stopPropagation'); 

    // 1. If Focused, Escape should Close Focus (Call Store) 
    focusedWidgetIdSig.set('w1'); 
    fixture.detectChanges(); 
    component.onEscape(event); 
    expect(mockStore.setFocusedWidget).toHaveBeenCalledWith(null); 
    expect(deleteEmitted).toBe(false); 

    // 2. If Not Focused but Edit Mode, Escape should Delete
    focusedWidgetIdSig.set(null); 
    isEditModeSig.set(true); 
    fixture.detectChanges(); 
    component.onEscape(event); 
    expect(deleteEmitted).toBe(true); 
  }); 

  it('should toggle focus when button clicked', () => { 
    // Initial State: Not Focused
    focusedWidgetIdSig.set(null); 
    fixture.detectChanges(); 
    component.toggleFocus(); 
    expect(mockStore.setFocusedWidget).toHaveBeenCalledWith('w1'); 

    // State: Already Focused
    focusedWidgetIdSig.set('w1'); 
    fixture.detectChanges(); 
    component.toggleFocus(); 
    expect(mockStore.setFocusedWidget).toHaveBeenCalledWith(null); 
  }); 

  it('should render VizTable when visualization is "table"', () => { 
    dataMapSig.set({ 'w1': { columns: ['a'], data: [{a: 1}] } }); 
    fixture.detectChanges(); 

    const viz = fixture.debugElement.query(By.directive(VizTableComponent)); 
    expect(viz).toBeTruthy(); 
  }); 
});