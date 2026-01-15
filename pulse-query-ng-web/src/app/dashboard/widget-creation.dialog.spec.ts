import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetCreationDialog, WidgetCreationData } from './widget-creation.dialog';
import { DashboardsService, WidgetResponse, DashboardResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { signal, Component, input, WritableSignal } from '@angular/core';

@Component({ selector: 'app-sql-builder', standalone: true, template: '' })
class MockSqlBuilder { dashboardId = input<string>(); widgetId = input<string>(); initialSql = input<string>(); }

@Component({ selector: 'app-http-config', standalone: true, template: '' })
class MockHttpConfig { dashboardId = input<string>(); widgetId = input<string>(); initialConfig = input<Record<string, any>>(); }

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
      remove: { imports: [] },
      add: { imports: [MockSqlBuilder, MockHttpConfig] }
    }).compileComponents();

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
});