/** 
 * @fileoverview Unit tests for TextEditorComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { signal } from '@angular/core';
import { TextEditorComponent } from './text-editor.component'; 
import { DashboardsService } from '../api-client'; 
import { of, throwError } from 'rxjs'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { vi } from 'vitest';
import { By } from '@angular/platform-browser';

describe('TextEditorComponent', () => { 
  let component: TextEditorComponent; 
  let fixture: ComponentFixture<TextEditorComponent>; 
  let mockApi: any; 

  beforeEach(async () => { 
    mockApi = { updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})) }; 

    await TestBed.configureTestingModule({ 
      imports: [TextEditorComponent, NoopAnimationsModule], 
      providers: [ 
        { provide: DashboardsService, useValue: mockApi } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(TextEditorComponent); 
    component = fixture.componentInstance; 
    
    (component as any).dashboardId = signal('d1'); 
    (component as any).widgetId = signal('w1'); 
    (component as any).initialContent = signal('Initial Text'); 
    
    fixture.detectChanges(); 
  }); 

  it('should initialize with content', () => { 
    expect(component.form.value.content).toBe('Initial Text'); 
  }); 

  it('should call API on save', () => { 
    component.form.patchValue({ content: 'New Text' }); 
    component.save(); 

    expect(mockApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith( 
        'w1', 
        expect.objectContaining({ config: { content: 'New Text' } }) 
    ); 
  }); 

  it('should not save when form invalid', () => {
    component.form.patchValue({ content: '' });
    component.save();
    expect(mockApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should emit contentChange on success', () => {
    const emitSpy = vi.spyOn(component.contentChange, 'emit');
    component.form.patchValue({ content: 'Emit Text' });
    component.save();
    expect(emitSpy).toHaveBeenCalledWith('Emit Text');
  });

  it('should handle API errors', () => {
    mockApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('fail'))
    );
    component.form.patchValue({ content: 'Err Text' });
    component.save();
    expect(component.isRunning()).toBe(false);
  });

  it('should coerce falsy content to empty string', () => {
    component.form.patchValue({ content: 0 as any });
    component.save();
    expect(mockApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ config: { content: '' } })
    );
  });

  it('should wire save button click in template', () => {
    const saveSpy = vi.spyOn(component, 'save');
    component.form.patchValue({ content: 'Click Save' });
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('button[mat-flat-button]'));
    btn.triggerEventHandler('click', null);
    expect(saveSpy).toHaveBeenCalled();
  });

  it('should show spinner when running', () => {
    component.isRunning.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('mat-spinner'))).toBeTruthy();
  });
}); 
