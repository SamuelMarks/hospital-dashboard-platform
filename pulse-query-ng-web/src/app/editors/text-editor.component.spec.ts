/** 
 * @fileoverview Unit tests for TextEditorComponent. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { TextEditorComponent } from './text-editor.component'; 
import { DashboardsService } from '../api-client'; 
import { of } from 'rxjs'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 

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
    
    fixture.componentRef.setInput('dashboardId', 'd1'); 
    fixture.componentRef.setInput('widgetId', 'w1'); 
    fixture.componentRef.setInput('initialContent', 'Initial Text'); 
    
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
});