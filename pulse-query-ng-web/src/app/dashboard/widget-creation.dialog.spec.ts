import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetCreationDialog, WidgetCreationData } from './widget-creation.dialog';
import { DashboardsService, WidgetResponse, DashboardResponse } from '../api-client';
import { DashboardStore } from './dashboard.store';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { HttpConfigComponent } from '../editors/http-config.component';
import { of, throwError } from 'rxjs';
import { signal, Component, input, WritableSignal, NO_ERRORS_SCHEMA } from '@angular/core';
import { vi } from 'vitest';
import { readTemplate } from '../../test-utils/component-resources';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-sql-builder',
  template: '',
})
class MockSqlBuilder {
  readonly dashboardId = input<string | undefined>();
  readonly widgetId = input<string | undefined>();
  readonly initialSql = input<string | undefined>();
}

@Component({
  selector: 'app-http-config',
  template: '',
})
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
  let mockSnackBar: any;

  const MOCK_DASH_ID = 'dash-1';
  const MOCK_WIDGET: WidgetResponse = {
    id: 'w1',
    dashboard_id: MOCK_DASH_ID,
    title: 'Draft',
    type: 'SQL',
    visualization: 'bar_chart',
    config: { query: 'FOO' },
  };
  let dataMapSig: WritableSignal<Record<string, any>>;

  beforeEach(async () => {
    mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
      getDashboardApiV1DashboardsDashboardIdGet: vi.fn(),
    };
    mockDialogRef = { close: vi.fn() };
    mockSnackBar = { open: vi.fn() };

    dataMapSig = signal({ w1: { columns: ['colA', 'colB'] } });
    mockStore = { dataMap: dataMapSig, refreshWidget: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [WidgetCreationDialog, NoopAnimationsModule],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: MOCK_DASH_ID } as WidgetCreationData },
        { provide: DashboardStore, useValue: mockStore },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    })
      .overrideComponent(WidgetCreationDialog, {
        remove: { imports: [SqlBuilderComponent, HttpConfigComponent] },
        add: { imports: [MockSqlBuilder, MockHttpConfig] },
      })
      .overrideComponent(WidgetCreationDialog, {
        set: {
          template: readTemplate('./widget-creation.dialog.html'),
          templateUrl: undefined,
          styleUrl: undefined,
          styleUrls: undefined,
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(WidgetCreationDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should handle draft creation errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    component.setType('SQL');
    component.selectedViz.set('table');
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    component.createDraftWidget();

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringContaining('Failed'),
      expect.anything(),
      expect.anything(),
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);

    consoleSpy.mockRestore();
  });

  it('should compute supportsMapping correctly', () => {
    component.selectedViz.set('bar_chart');
    expect(component.supportsMapping()).toBe(true);

    component.selectedViz.set('table');
    expect(component.supportsMapping()).toBe(false);

    component.selectedViz.set(null);
    expect(component.supportsMapping()).toBe(false);
  });

  it('should compute isPie correctly', () => {
    component.selectedViz.set('pie');
    expect(component.isPie()).toBe(true);

    component.selectedViz.set('table');
    expect(component.isPie()).toBe(false);
  });

  it('should compute availableColumns correctly', () => {
    expect(component.availableColumns()).toEqual([]);

    component.draftWidget.set(MOCK_WIDGET);
    expect(component.availableColumns()).toEqual(['colA', 'colB']);

    dataMapSig.set({});
    expect(component.availableColumns()).toEqual([]);

    dataMapSig.set({ w1: { columns: 'not array' } });
    expect(component.availableColumns()).toEqual([]);
  });

  it('should delete draft on destroy', () => {
    component.draftWidget.set(MOCK_WIDGET);
    component.ngOnDestroy();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith('w1');
  });

  it('should handle error on delete draft on destroy', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(
      throwError(() => new Error('err')),
    );
    component.draftWidget.set(MOCK_WIDGET);
    component.ngOnDestroy();
    expect(consoleSpy).toHaveBeenCalledWith('Draft cleanup failed', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('should not delete draft on destroy if no draft', () => {
    component.draftWidget.set(null);
    component.ngOnDestroy();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).not.toHaveBeenCalled();
  });

  it('should create draft widget for SQL', () => {
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(MOCK_WIDGET));
    component.setType('SQL');
    component.selectedViz.set('table');

    component.createDraftWidget();

    expect(component.draftWidget()).toEqual(MOCK_WIDGET);
    expect(component.configForm.value.title).toBe('New Table');
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w1');
  });

  it('should create draft widget for HTTP', () => {
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(MOCK_WIDGET));
    component.setType('HTTP');
    component.selectedViz.set('bar_chart');

    component.createDraftWidget();

    expect(component.draftWidget()).toEqual(MOCK_WIDGET);
    expect(component.configForm.value.title).toBe('New Bar Chart');
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('w1');

    component.createDraftWidget();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledTimes(1);
  });

  it('should not create draft widget if already creating', () => {
    component.isCreatingDraft.set(true);
    component.createDraftWidget();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
  });

  it('should cancel and close dialog', () => {
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  describe('finalizeWidget', () => {
    const dashResp: DashboardResponse = {
      id: MOCK_DASH_ID,
      name: 'Dash',
      widgets: [MOCK_WIDGET],
      owner_id: 'user1',
    };

    beforeEach(() => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dashResp));
      mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
      component.draftWidget.set(MOCK_WIDGET);
      component.configForm.patchValue({ title: 'Updated Title', xKey: 'x', yKey: 'y' });
    });

    it('should finalize widget with mapping support', () => {
      component.selectedViz.set('bar_chart');
      component.finalizeWidget();

      expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({
          title: 'Updated Title',
          config: expect.objectContaining({
            query: 'FOO',
            xKey: 'x',
            yKey: 'y',
          }),
        }),
      );
      expect(component.draftWidget()).toBeNull();
      expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    });

    it('should finalize widget without mapping support', () => {
      component.selectedViz.set('table');
      component.finalizeWidget();

      expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
        'w1',
        expect.objectContaining({
          title: 'Updated Title',
          config: { query: 'FOO' },
        }),
      );
      expect(component.draftWidget()).toBeNull();
      expect(mockDialogRef.close).toHaveBeenCalledWith(true);
    });

    it('should return early if no draft', () => {
      component.draftWidget.set(null);
      component.finalizeWidget();
      expect(mockDashApi.getDashboardApiV1DashboardsDashboardIdGet).not.toHaveBeenCalled();
    });

    it('should return early if form is invalid', () => {
      component.configForm.patchValue({ title: '' });
      component.finalizeWidget();
      expect(mockDashApi.getDashboardApiV1DashboardsDashboardIdGet).not.toHaveBeenCalled();
    });

    it('should return early if widget not found in dashboard', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(
        of({
          id: MOCK_DASH_ID,
          title: 'Dash',
          widgets: [],
          owner_id: 'user1',
          version: 1,
          created_at: '',
          updated_at: '',
        }),
      );
      component.finalizeWidget();
      expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
    });
  });
});
