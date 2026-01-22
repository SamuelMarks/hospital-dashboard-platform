import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { WidgetBuilderComponent } from './widget-builder.component'; 
import { DashboardsService, ExecutionService, TemplatesService, WidgetResponse, TemplateResponse } from '../../api-client'; 
import { DashboardStore } from '../dashboard.store'; 
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { of } from 'rxjs'; 
import { signal } from '@angular/core'; 
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

// Mocks
const MOCK_TEMPLATE: TemplateResponse = { 
  id: 't1', title: 'Admissions', category: 'Ops', sql_template: 'SELECT 1', parameters_schema: {} 
}; 
const MOCK_DRAFT: WidgetResponse = { 
  id: 'draft-1', dashboard_id: 'd1', title: 'New Widget', type: 'SQL', visualization: 'table', config: { query: 'SELECT 1' } 
}; 

describe('WidgetBuilderComponent', () => { 
  let component: WidgetBuilderComponent; 
  let fixture: ComponentFixture<WidgetBuilderComponent>; 
  
  let mockDashApi: any; 
  let mockExecApi: any; 
  let mockTplApi: any; 
  let mockDialogRef: any; 
  let mockStore: any; 

  beforeEach(async () => { 
    mockDashApi = { 
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(), 
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(), 
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})) 
    }; 
    mockExecApi = { 
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn().mockReturnValue(of({})) 
    }; 
    mockTplApi = { 
      listTemplatesApiV1TemplatesGet: vi.fn().mockReturnValue(of([MOCK_TEMPLATE])) 
    }; 
    mockDialogRef = { close: vi.fn() }; 
    mockStore = { 
      dataMap: signal({ 'draft-1': { columns: ['A', 'B'] } }), 
      refreshWidget: vi.fn(), 
      loadDashboard: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [WidgetBuilderComponent, NoopAnimationsModule], 
      providers: [ 
        { provide: DashboardsService, useValue: mockDashApi }, 
        { provide: ExecutionService, useValue: mockExecApi }, 
        { provide: TemplatesService, useValue: mockTplApi }, 
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: MatDialogRef, useValue: mockDialogRef }, 
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'd1' } } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(WidgetBuilderComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should initialize and load templates', () => { 
    expect(component).toBeTruthy(); 
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).toHaveBeenCalled(); 
    expect(component.templates().length).toBe(1); 
  }); 

  it('should create draft widget on initialization of custom flow and advance stepper', () => { 
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(MOCK_DRAFT)); 
    
    // Mock Stepper
    const mockStepper = { next: vi.fn() } as any; 

    // Select Custom SQL type
    component.selectCustomType('SQL'); 
    component.initializeDraft(mockStepper); 

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith( 
      'd1', 
      expect.objectContaining({ type: 'SQL', visualization: 'table' }) 
    ); 
    expect(component.draftWidget()).toEqual(MOCK_DRAFT); 
    expect(mockStepper.next).toHaveBeenCalled(); 
  }); 

  it('should handle TEXT widget creation flow', () => { 
    const textDraft = { 
        ...MOCK_DRAFT, 
        type: 'TEXT', 
        visualization: 'markdown', 
        config: { content: 'test' } 
    }; 
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(textDraft)); 

    component.selectCustomType('TEXT'); 
    component.initializeDraft(); // Optional arg check

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith( 
        'd1', 
        expect.objectContaining({ type: 'TEXT', visualization: 'markdown' }) 
    ); 
  }); 

  it('should merge template params and run execution', () => { 
    // Setup state as if draft created from template
    const tplDraft = { ...MOCK_DRAFT, title: 'Admissions' }; 
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(tplDraft)); 
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of(tplDraft)); 

    component.selectTemplate(MOCK_TEMPLATE); 
    component.initializeDraft(); 
    
    // Simulate param entry
    component.templateParams.set({ limit: 10 }); 
    
    // Mock stepper to preventing crashing on .next() 
    const mockStepper = { next: vi.fn() } as any; 
    
    component.runTemplateQuery(mockStepper); 

    // Should update widget with compiled SQL
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalled(); 
    // And refresh
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('draft-1'); 
  }); 

  it('should update visualization type locally', () => { 
    component.draftWidget.set(MOCK_DRAFT); 
    component.updateVizType('pie'); 
    
    const w = component.draftWidget(); 
    expect(w?.visualization).toBe('pie'); 
  }); 

  it('should cleanup on cancel', () => { 
    component.draftWidget.set(MOCK_DRAFT); 
    component.cancel(); 
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith('draft-1'); 
    expect(mockDialogRef.close).toHaveBeenCalledWith(false); 
  }); 
});