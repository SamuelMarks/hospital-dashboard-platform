import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetCreationDialog, WidgetCreationData } from './widget-creation.dialog';
import { DashboardsService, WidgetResponse, DashboardResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { By } from '@angular/platform-browser';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { HttpConfigComponent } from '../editors/http-config.component';
import { of, throwError } from 'rxjs';
import { signal, Component, input, WritableSignal, NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { readTemplate } from '../../test-utils/component-resources';

@Component({ selector: 'app-sql-builder', template: '' })
class MockSqlBuilder { 
  readonly dashboardId = input<string | undefined>();
  readonly widgetId = input<string | undefined>();
  readonly initialSql = input<string | undefined>();
}

@Component({ selector: 'app-http-config', template: '' })
class MockHttpConfig { 
  readonly dashboardId = input<string | undefined>();
  readonly widgetId = input<string | undefined>();
  readonly initialConfig = input<Record<string, any> | undefined>();
}

describe('WidgetCreationDialog', () => {
  let component: WidgetCreationDialog;
  let fixture: ComponentFixture<WidgetCreationDialog>;
  
  let mockDashApi: any;
  let mockStore: any;
  let mockDialogRef: any;

  const MOCK_DASH_ID = 'dash-1';
  const MOCK_WIDGET: WidgetResponse = {
    id: 'w1', dashboard_id: MOCK_DASH_ID, title: 'Draft', type: 'SQL', visualization: 'bar_chart', config: { query: 'FOO' }
  };

  let dataMapSig: WritableSignal<Record<string, any>>;

  beforeEach(async () => {
    mockDashApi = {
        createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
        updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
        // FIX: Ensure delete returns observable for ngOnDestroy cleanup
        deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
        getDashboardApiV1DashboardsDashboardIdGet: vi.fn()
    };
    mockDialogRef = { close: vi.fn() };
    
    dataMapSig = signal({ 'w1': { columns: ['colA', 'colB'] } });
    mockStore = { dataMap: dataMapSig, refreshWidget: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [WidgetCreationDialog, NoopAnimationsModule],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: MOCK_DASH_ID } as WidgetCreationData },
        { provide: DashboardStore, useValue: mockStore }
      ]
    })
    .overrideComponent(WidgetCreationDialog, {
      remove: { imports: [SqlBuilderComponent, HttpConfigComponent] },
      add: { imports: [MockSqlBuilder, MockHttpConfig] }
    })
    .overrideComponent(WidgetCreationDialog, {
      set: {
        template: readTemplate('./widget-creation.dialog.html'),
        templateUrl: null,
        schemas: [NO_ERRORS_SCHEMA]
      }
    })
    .compileComponents();

    fixture = TestBed.createComponent(WidgetCreationDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should call create draft API when transitioned to Step 3', () => {
    component.setType('SQL'); 
    fixture.detectChanges(); 
    component.selectedViz.set('bar_chart'); 
    fixture.detectChanges(); 
    
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(MOCK_WIDGET));

    component.createDraftWidget(); 

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalled(); 
    expect(component.draftWidget()).toEqual(MOCK_WIDGET); 
  });

  it('should set selected type', () => {
    component.setType('SQL');
    expect(component.selectedType()).toBe('SQL');
  });

  it('should create HTTP draft widget', () => {
    component.setType('HTTP');
    component.selectedViz.set('metric');
    const httpWidget = { ...MOCK_WIDGET, type: 'HTTP', visualization: 'metric' };
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(httpWidget));

    component.createDraftWidget();

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      MOCK_DASH_ID,
      expect.objectContaining({ type: 'HTTP', visualization: 'metric' })
    );
  });

  it('should skip draft creation when already creating or existing', () => {
    component.draftWidget.set(MOCK_WIDGET);
    component.createDraftWidget();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
  });

  it('should skip draft creation when already creating', () => {
    component.isCreatingDraft.set(true);
    component.createDraftWidget();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
  });

  it('should handle draft creation errors', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    component.setType('SQL');
    component.selectedViz.set('table');
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
      throwError(() => new Error('fail'))
    );

    component.createDraftWidget();

    expect(alertSpy).toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should Finalize: Merge Settings and Close(true)', () => {
    component.draftWidget.set(MOCK_WIDGET); 
    component.selectedViz.set('bar_chart'); 
    component.configForm.patchValue({ title: 'Final Title' }); 

    const freshDash = { 
        id: MOCK_DASH_ID, 
        name: 'D', 
        owner_id: 'u', 
        widgets: [ { ...MOCK_WIDGET, config: { query: 'UPDATED' } } ] 
    } as DashboardResponse; 

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(freshDash)); 
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of(MOCK_WIDGET)); 

    component.finalizeWidget(); 

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith( 
      'w1', 
      expect.objectContaining({ title: 'Final Title' }) 
    ); 
    expect(mockDialogRef.close).toHaveBeenCalledWith(true); 
  });

  it('should finalize without mapping for non-mapped viz', () => {
    const freshDash = {
      id: MOCK_DASH_ID,
      name: 'D',
      owner_id: 'u',
      widgets: [ { ...MOCK_WIDGET, config: { query: 'UPDATED' } } ]
    } as DashboardResponse;

    component.draftWidget.set({ ...MOCK_WIDGET, visualization: 'table' });
    component.selectedViz.set('table');
    component.configForm.patchValue({ title: 'Final Title', xKey: 'x', yKey: 'y' });
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(freshDash));
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of(MOCK_WIDGET));

    component.finalizeWidget();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ config: { query: 'UPDATED' } })
    );
  });

  it('should no-op finalize without draft or invalid form', () => {
    component.draftWidget.set(null);
    component.finalizeWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();

    component.draftWidget.set(MOCK_WIDGET);
    component.configForm.patchValue({ title: '' });
    component.finalizeWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should skip finalize when fresh widget is missing', () => {
    component.draftWidget.set(MOCK_WIDGET);
    component.configForm.patchValue({ title: 'Final' });
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of({ id: MOCK_DASH_ID, widgets: [] }));

    component.finalizeWidget();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should compute helpers and available columns', () => {
    component.selectedViz.set('pie');
    expect(component.supportsMapping()).toBe(true);
    expect(component.isPie()).toBe(true);

    component.draftWidget.set(MOCK_WIDGET);
    expect(component.availableColumns()).toEqual(['colA', 'colB']);
  });
  
  it('should return empty available columns when columns missing', () => {
    dataMapSig.set({ w1: { data: [] } });
    component.draftWidget.set(MOCK_WIDGET);
    expect(component.availableColumns()).toEqual([]);
  });

  it('should return empty columns when result missing', () => {
    component.draftWidget.set(MOCK_WIDGET);
    mockStore.dataMap.set({});
    expect(component.availableColumns()).toEqual([]);
  });

  it('should compute supportsMapping false for non-mapped viz', () => {
    component.selectedViz.set('table');
    expect(component.supportsMapping()).toBe(false);
    expect(component.isPie()).toBe(false);
  });
  
  it('should compute supportsMapping false when no viz selected', () => {
    component.selectedViz.set(null);
    expect(component.supportsMapping()).toBe(false);
    expect(component.isPie()).toBe(false);
  });
  
  it('should return empty columns when no draft widget', () => {
    component.draftWidget.set(null);
    expect(component.availableColumns()).toEqual([]);
  });

  it('should cleanup draft on destroy', () => {
    component.draftWidget.set(MOCK_WIDGET);
    component.ngOnDestroy();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith('w1');
  });

  it('should warn when draft cleanup fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(
      throwError(() => new Error('fail'))
    );
    component.draftWidget.set(MOCK_WIDGET);
    component.ngOnDestroy();
    expect(warnSpy).toHaveBeenCalledWith('Draft cleanup failed', expect.anything());
    warnSpy.mockRestore();
  });

  it('should skip cleanup when no draft', () => {
    component.draftWidget.set(null);
    component.ngOnDestroy();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).not.toHaveBeenCalled();
  });

  it('should format titles', () => {
    const title = (component as any).formatTitle('bar_chart');
    expect(title).toBe('Bar Chart');
  });

  it('should close dialog on cancel', () => {
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should select data source and visualization via template clicks', () => {
    const sqlOption = fixture.debugElement.query(By.css('[data-testid="option-sql"]'));
    const httpOption = fixture.debugElement.query(By.css('[data-testid="option-http"]'));
    sqlOption.triggerEventHandler('click', null);
    expect(component.selectedType()).toBe('SQL');
    httpOption.triggerEventHandler('click', null);
    expect(component.selectedType()).toBe('HTTP');

    const vizTable = fixture.debugElement.query(By.css('[data-testid="viz-table"]'));
    const vizPie = fixture.debugElement.query(By.css('[data-testid="viz-pie"]'));
    vizTable.triggerEventHandler('click', null);
    expect(component.selectedViz()).toBe('table');
    vizPie.triggerEventHandler('click', null);
    expect(component.selectedViz()).toBe('pie');
  });

  it('should trigger draft creation from step button click', () => {
    component.setType('SQL');
    component.selectedViz.set('bar_chart');
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(MOCK_WIDGET));
    fixture.detectChanges();

    const next = fixture.debugElement.query(By.css('[data-testid="btn-next-step2"]'));
    next.triggerEventHandler('click', null);

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalled();
  });

  it('should render config step content for SQL and HTTP types', () => {
    component.draftWidget.set(MOCK_WIDGET);
    component.selectedType.set('SQL');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MockSqlBuilder))).toBeTruthy();

    component.selectedType.set('HTTP');
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(MockHttpConfig))).toBeTruthy();
  });

  it('should show mapping fields when visualization supports mapping', () => {
    component.selectedViz.set('pie');
    component.draftWidget.set(MOCK_WIDGET);
    fixture.detectChanges();
    const formFields = fixture.debugElement.queryAll(By.css('mat-form-field'));
    expect(formFields.length).toBeGreaterThanOrEqual(2);
  });

  it('should render creating state when draft is initializing', () => {
    component.isCreatingDraft.set(true);
    fixture.detectChanges();
    const spinner = fixture.debugElement.query(By.css('mat-spinner'));
    expect(spinner).toBeTruthy();
  });

  it('should wire cancel and finalize buttons in template', () => {
    const finalizeSpy = vi.spyOn(component, 'finalizeWidget').mockImplementation(() => {});
    const cancelSpy = vi.spyOn(component, 'cancel');

    component.draftWidget.set(MOCK_WIDGET);
    component.selectedViz.set('bar_chart');
    component.configForm.patchValue({ title: 'Ready' });
    fixture.detectChanges();

    const cancelBtn = fixture.debugElement.query(By.css('button[mat-button][color=\"warn\"]'));
    cancelBtn.triggerEventHandler('click', null);
    expect(cancelSpy).toHaveBeenCalled();

    const finishBtn = fixture.debugElement.query(By.css('[data-testid=\"btn-finish\"]'));
    finishBtn.triggerEventHandler('click', null);
    expect(finalizeSpy).toHaveBeenCalled();
  });
});
