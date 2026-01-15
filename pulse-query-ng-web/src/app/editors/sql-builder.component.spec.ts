/**
 * @fileoverview Unit tests for SqlBuilderComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { SqlBuilderComponent } from './sql-builder.component'; 
import { DashboardsService, ExecutionService, BASE_PATH } from '../api-client'; 
import { DashboardStore } from '../dashboard/dashboard.store'; 
import { provideHttpClient } from '@angular/common/http'; 
import { provideHttpClientTesting } from '@angular/common/http/testing'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { of } from 'rxjs'; 
import { signal } from '@angular/core'; 

describe('SqlBuilderComponent', () => { 
  let component: SqlBuilderComponent; 
  let fixture: ComponentFixture<SqlBuilderComponent>; 
  
  let mockDashApi: any; 
  let mockExecApi: any; 
  let mockStore: any; 

  beforeEach(async () => { 
    mockDashApi = { updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn() }; 
    mockExecApi = { refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn() }; 
    
    mockStore = { 
      globalParams: signal<Record<string, any>>({ dept: 'Cardiology' }) 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [SqlBuilderComponent, NoopAnimationsModule], 
      providers: [ 
        provideHttpClient(), 
        provideHttpClientTesting(), 
        { provide: DashboardsService, useValue: mockDashApi }, 
        { provide: ExecutionService, useValue: mockExecApi }, 
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: BASE_PATH, useValue: 'http://api' } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(SqlBuilderComponent); 
    component = fixture.componentInstance; 
    fixture.componentRef.setInput('dashboardId', 'd1'); 
    fixture.componentRef.setInput('widgetId', 'w1'); 
    fixture.componentRef.setInput('initialSql', "SELECT * FROM t WHERE d='{{dept}}'"); 
    fixture.detectChanges(); 
  }); 

  it('should inject parameters into SQL before run', () => { 
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({})); 
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({'w1': { data: [] }})); 

    component.runQuery(); 

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith( 
        'w1', 
        expect.objectContaining({ 
            config: { query: "SELECT * FROM t WHERE d='Cardiology'" } 
        }) 
    ); 
  }); 

  it('should display available parameters in menu', () => { 
    expect(component.availableParams()).toContain('dept'); 
  }); 

  it('should insert parameter token into text using signal updates', () => { 
    component.currentSql.set("SELECT "); 
    component.insertParam('dept'); 
    expect(component.currentSql()).toBe("SELECT  {{dept}}"); 
  }); 
});