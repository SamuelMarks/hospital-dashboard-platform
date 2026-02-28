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
});
