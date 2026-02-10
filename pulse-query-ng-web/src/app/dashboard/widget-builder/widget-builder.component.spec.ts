import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { type WidgetBuilderComponent as WidgetBuilderComponentType } from './widget-builder.component'; 
import { DashboardsService, ExecutionService, TemplatesService, WidgetResponse, TemplateResponse } from '../../api-client'; 
import { DashboardStore } from '../dashboard.store'; 
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { of, throwError } from 'rxjs'; 
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
  let component: WidgetBuilderComponentType; 
  let fixture: ComponentFixture<WidgetBuilderComponentType>; 
  let WidgetBuilderComponentCtor: typeof import('./widget-builder.component').WidgetBuilderComponent;
  
  let mockDashApi: any; 
  let mockExecApi: any; 
  let mockTplApi: any; 
  let mockDialogRef: any; 
  let mockStore: any; 

  beforeEach(async () => { 
    const mod = await import('./widget-builder.component');
    WidgetBuilderComponentCtor = mod.WidgetBuilderComponent;

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
      imports: [WidgetBuilderComponentCtor, NoopAnimationsModule], 
      schemas: [NO_ERRORS_SCHEMA],
      providers: [ 
        { provide: DashboardsService, useValue: mockDashApi }, 
        { provide: ExecutionService, useValue: mockExecApi }, 
        { provide: TemplatesService, useValue: mockTplApi }, 
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: MatDialogRef, useValue: mockDialogRef }, 
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'd1' } } 
      ] 
    })
    .overrideComponent(WidgetBuilderComponentCtor, {
      set: { template: '<div></div>', schemas: [NO_ERRORS_SCHEMA] }
    })
    .compileComponents(); 

    fixture = TestBed.createComponent(WidgetBuilderComponentCtor); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should initialize and load templates', () => { 
    expect(component).toBeTruthy(); 
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).toHaveBeenCalled(); 
    expect(component.templates().length).toBe(1); 
  }); 
  
  it('should expose template helpers and defaults', () => {
    component.selectedTemplate.set({
      id: 't2',
      title: 'Other',
      category: 'Ops',
      sql_template: 'SELECT 1'
    } as TemplateResponse);

    expect(component.selectedTemplateId()).toBe('t2');
    expect(component.paramsSchema()).toEqual({});
  });

  it('should update search and reload templates', () => {
    vi.useFakeTimers();
    const loadSpy = vi.spyOn(component, 'loadTemplates');
    component.updateSearch({ target: { value: 'icu' } } as any);
    vi.advanceTimersByTime(300);
    expect(loadSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should load templates with category and search', () => {
    component.selectedCategory.set('Clinical');
    component.loadTemplates('term');
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).toHaveBeenCalledWith('Clinical', 'term');
  });

  it('should toggle category and reload templates', () => {
    component.toggleCategory('Clinical');
    expect(component.selectedCategory()).toBe('Clinical');
    component.toggleCategory('Clinical');
    expect(component.selectedCategory()).toBeNull();
  });

  it('should select template and reset custom type', () => {
    component.selectCustomType('SQL');
    component.selectTemplate(MOCK_TEMPLATE);
    expect(component.activeMode()).toBe('template');
    expect(component.selectedTemplate()).toEqual(MOCK_TEMPLATE);
    expect(component.selectedCustomType()).toBeNull();
  });

  it('should select custom type and reset template', () => {
    component.selectTemplate(MOCK_TEMPLATE);
    component.selectCustomType('HTTP');
    expect(component.activeMode()).toBe('custom');
    expect(component.selectedCustomType()).toBe('HTTP');
    expect(component.selectedTemplate()).toBeNull();
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
    const payload = mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mock.calls[0][1];
    expect(payload.title).toBe('Text Block');
    expect(payload.config?.content).toContain('New Text Widget');
  }); 

  it('should handle HTTP widget creation flow', () => {
    const httpDraft = { ...MOCK_DRAFT, type: 'HTTP', visualization: 'metric', config: { url: '' } };
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(httpDraft));

    component.selectCustomType('HTTP');
    component.initializeDraft();

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ type: 'HTTP', visualization: 'metric' })
    );
  });

  it('should fallback to TEXT payload for unsupported custom types', () => {
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(MOCK_DRAFT));

    component.activeMode.set('custom');
    component.selectedCustomType.set('UNKNOWN' as any);
    component.initializeDraft();

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ type: 'TEXT', visualization: 'markdown' })
    );
  });

  it('should handle draft creation errors', () => {
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(throwError(() => new Error('fail')));
    component.selectCustomType('SQL');
    component.initializeDraft();
    expect(component.isBusy()).toBe(false);
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

  it('should handle runTemplateQuery error', () => {
    const tplDraft = { ...MOCK_DRAFT, title: 'Admissions' };
    component.selectTemplate(MOCK_TEMPLATE);
    component.draftWidget.set(tplDraft);
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(throwError(() => new Error('fail')));

    const mockStepper = { next: vi.fn() } as any;
    component.runTemplateQuery(mockStepper);
    expect(component.isBusy()).toBe(false);
  });

  it('should no-op runTemplateQuery when draft missing', () => {
    const mockStepper = { next: vi.fn() } as any;
    component.draftWidget.set(null);
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.runTemplateQuery(mockStepper);
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
    expect(component.isBusy()).toBe(false);
  });
  
  it('should no-op runTemplateQuery when template missing', () => {
    const mockStepper = { next: vi.fn() } as any;
    component.draftWidget.set(MOCK_DRAFT);
    component.selectedTemplate.set(null);
    component.runTemplateQuery(mockStepper);
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
    expect(component.isBusy()).toBe(false);
  });

  it('should validate data presence and advance', () => {
    const mockStepper = { next: vi.fn() } as any;
    component.draftWidget.set(MOCK_DRAFT);
    component.validateDataPresence(mockStepper);
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('draft-1');
    expect(mockStepper.next).toHaveBeenCalled();
  });

  it('should sync draft config on SQL/config/content changes', () => {
    component.draftWidget.set({ ...MOCK_DRAFT, config: { query: 'SELECT 1' } });

    component.onSqlChange('SELECT 2');
    expect(component.draftWidget()?.config?.['query']).toBe('SELECT 2');

    component.onConfigChange({ url: 'https://example.com' });
    expect(component.draftWidget()?.config?.['url']).toBe('https://example.com');

    component.onContentChange('Hello');
    expect(component.draftWidget()?.config?.['content']).toBe('Hello');
  });
  
  it('should no-op sync changes when draft missing', () => {
    component.draftWidget.set(null);
    component.onSqlChange('SELECT 2');
    component.onConfigChange({ url: 'x' });
    component.onContentChange('Hello');
    expect(component.draftWidget()).toBeNull();
  });

  it('should fall back when visualization or columns are missing', () => {
    component.draftWidget.set({ ...MOCK_DRAFT, id: 'draft-missing', visualization: undefined } as any);
    mockStore.dataMap.set({});

    expect(component.availableColumns()).toEqual([]);
    expect(component.showAxesConfig()).toBe(false);
  });

  it('should advance even without draft id', () => {
    const mockStepper = { next: vi.fn() } as any;
    component.draftWidget.set(null);
    component.validateDataPresence(mockStepper);
    expect(mockStore.refreshWidget).not.toHaveBeenCalledWith(null);
    expect(mockStepper.next).toHaveBeenCalled();
  });

  it('should sync draft widget from child editors', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.onSqlChange('SELECT 2');
    expect(component.draftWidget()?.config['query']).toBe('SELECT 2');

    component.onConfigChange({ url: 'http://x' });
    expect(component.draftWidget()?.config['url']).toBe('http://x');

    component.onContentChange('Hello');
    expect(component.draftWidget()?.config['content']).toBe('Hello');
  });

  it('should update visualization type locally', () => { 
    component.draftWidget.set(MOCK_DRAFT); 
    component.updateVizType('pie'); 
    
    const w = component.draftWidget(); 
    expect(w?.visualization).toBe('pie'); 
  }); 

  it('should skip updateVizType when no draft', () => {
    component.draftWidget.set(null);
    component.updateVizType('pie');
    expect(component.draftWidget()).toBeNull();
  });

  it('should sync viz config from controls', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.xKeyControl.setValue('x');
    component.yKeyControl.setValue('y');
    expect(component.draftWidget()?.config['xKey']).toBe('x');
    expect(component.draftWidget()?.config['yKey']).toBe('y');
  });

  it('should skip sync when no draft widget', () => {
    component.draftWidget.set(null);
    component.syncVizConfig();
    expect(component.draftWidget()).toBeNull();
  });

  it('should sync title control into draft widget', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.titleControl.setValue('Updated');
    expect(component.draftWidget()?.title).toBe('Updated');
  });
  
  it('should ignore title changes when no draft widget', () => {
    component.draftWidget.set(null);
    component.titleControl.setValue('Updated');
    expect(component.draftWidget()).toBeNull();
  });

  it('should save and close with updated widget', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.titleControl.setValue('Updated Title');
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of(MOCK_DRAFT));

    component.saveAndClose();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    expect(component.draftWidget()).toBeNull();
  });

  it('should no-op save when no draft', () => {
    component.draftWidget.set(null);
    component.saveAndClose();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should cleanup on cancel', () => { 
    component.draftWidget.set(MOCK_DRAFT); 
    component.cancel(); 
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith('draft-1'); 
    expect(mockDialogRef.close).toHaveBeenCalledWith(false); 
  }); 

  it('should close dialog on cancel even without draft', () => {
    component.draftWidget.set(null);
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should compute helper flags', () => {
    component.draftWidget.set({ ...MOCK_DRAFT, visualization: 'bar_chart' });
    expect(component.showAxesConfig()).toBe(true);
    expect(component.isPie()).toBe(false);

    component.draftWidget.set({ ...MOCK_DRAFT, type: 'TEXT', visualization: 'markdown' });
    expect(component.showAxesConfig()).toBe(false);
  });
  
  it('should hide axes config for non-chart visualizations', () => {
    component.draftWidget.set({ ...MOCK_DRAFT, visualization: 'table' });
    expect(component.showAxesConfig()).toBe(false);
  });

  it('should compute dataConfigured based on mode', () => {
    component.activeMode.set('template');
    component.templateFormValid.set(false);
    expect(component.dataConfigured()).toBe(false);

    component.activeMode.set('custom');
    expect(component.dataConfigured()).toBe(true);
  });

  it('should compute available columns when draft exists', () => {
    component.draftWidget.set(MOCK_DRAFT);
    expect(component.availableColumns()).toEqual(['A', 'B']);
  });
  
  it('should return empty columns when no draft exists', () => {
    component.draftWidget.set(null);
    expect(component.availableColumns()).toEqual([]);
  });

  it('should unsubscribe on destroy', () => {
    const sub = { unsubscribe: vi.fn() };
    (component as any).sub = sub;
    component.ngOnDestroy();
    expect(sub.unsubscribe).toHaveBeenCalled();
  });
}); 
