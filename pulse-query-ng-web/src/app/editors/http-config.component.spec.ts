/**
 * @fileoverview Unit tests for HttpConfigComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { HttpConfigComponent, jsonValidator } from './http-config.component'; 
import { DashboardsService, ExecutionService } from '../api-client'; 
import { of, throwError } from 'rxjs'; 
import { FormControl } from '@angular/forms'; 

describe('HttpConfigComponent', () => { 
  let component: HttpConfigComponent; 
  let fixture: ComponentFixture<HttpConfigComponent>; 
  
  let mockDashboardsApi: any; 
  let mockExecutionApi: any; 

  beforeEach(async () => { 
    mockDashboardsApi = { 
        updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn() 
    }; 
    mockExecutionApi = { 
        refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [HttpConfigComponent], 
      providers: [ 
        { provide: DashboardsService, useValue: mockDashboardsApi }, 
        { provide: ExecutionService, useValue: mockExecutionApi } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(HttpConfigComponent); 
    component = fixture.componentInstance; 

    fixture.componentRef.setInput('dashboardId', 'd1'); 
    fixture.componentRef.setInput('widgetId', 'w1'); 
    fixture.componentRef.setInput('initialConfig', { 
      method: 'POST', 
      url: 'https://api.test.com', 
      params: { q: 'search' }, 
      headers: { 'X-Custom': '123' }, 
      body: { someProperty: 123 }, 
      meta_forward_auth: true
    }); 

    fixture.detectChanges(); 
  }); 

  it('should create and hydrate form', () => { 
    expect(component).toBeTruthy(); 
    const val = component.form.getRawValue(); 
    expect(val.method).toBe('POST'); 
    expect(val.url).toBe('https://api.test.com'); 
    expect(val.forward_auth).toBe(true); 
    
    expect(val.body).toContain('"someProperty": 123'); 
    
    expect(component.paramsArray.length).toBe(1); 
    expect(component.paramsArray.at(0).value).toEqual({ key: 'q', value: 'search' }); 

    expect(component.headersArray.length).toBe(1); 
    expect(component.headersArray.at(0).value).toEqual({ key: 'X-Custom', value: '123' }); 
  }); 

  it('should validate URL format', () => { 
    const urlControl = component.form.controls.url; 
    
    urlControl.setValue('invalid-url'); 
    expect(urlControl.valid).toBe(false); 

    urlControl.setValue('http://valid.com'); 
    expect(urlControl.valid).toBe(true); 
  }); 

  it('should validate JSON body', () => { 
    const bodyControl = component.form.controls.body; 
    
    bodyControl.setValue('{ invalid: json }'); 
    expect(bodyControl.valid).toBe(false); 
    expect(bodyControl.hasError('invalidJson')).toBe(true); 

    bodyControl.setValue('{ "valid": "json" }'); 
    expect(bodyControl.valid).toBe(true); 
    
    bodyControl.setValue(''); 
    expect(bodyControl.valid).toBe(true); 
  }); 

  describe('jsonValidator', () => { 
    const validator = jsonValidator(); 

    it('should return null for valid json', () => { 
      const control = new FormControl('{"a": 1}'); 
      expect(validator(control)).toBeNull(); 
    }); 

    it('should return error for invalid json', () => { 
      const control = new FormControl('{ a: 1 }'); 
      expect(validator(control)).toEqual({ invalidJson: true }); 
    }); 
  }); 

  it('should add and remove parameters dynamically', () => { 
    component.addItem('params'); 
    fixture.detectChanges(); 
    expect(component.paramsArray.length).toBe(2); 

    const newGroup = component.paramsArray.at(1); 
    newGroup.setValue({ key: 'page', value: '2' }); 

    component.removeItem('params', 0); 
    fixture.detectChanges(); 
    expect(component.paramsArray.length).toBe(1); 
    expect(component.paramsArray.at(0).value).toEqual({ key: 'page', value: '2' }); 
  }); 

  describe('saveAndTest', () => { 
    it('should update widget and refresh dashboard on success', () => { 
        mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({})); 
        mockExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({ 
            'w1': { status: 200, data: { success: true } } 
        })); 
        
        vi.spyOn(component.configChange, 'emit'); 

        const validBody = '{ "test": true }'; 
        component.form.patchValue({ body: validBody }); 
        
        component.saveAndTest(); 
        
        expect(component.isRunning()).toBe(false); 

        const expectedConfig = { 
            method: 'POST', 
            url: 'https://api.test.com', 
            params: { q: 'search' }, 
            headers: { 'X-Custom': '123' }, 
            body: { test: true }, 
            meta_forward_auth: true
        }; 
        
        expect(mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith( 
            'w1', 
            expect.objectContaining({ config: expectedConfig }) 
        ); 
        expect(mockExecutionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledWith('d1'); 

        expect(component.result()).toEqual({ status: 200, data: { success: true } }); 
        expect(component.configChange.emit).toHaveBeenCalled(); 
    }); 

    it('should block execution if form is invalid', () => { 
        component.form.controls.url.setValue(''); 
        component.saveAndTest(); 
        
        expect(mockDashboardsApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled(); 
    }); 
  }); 
});