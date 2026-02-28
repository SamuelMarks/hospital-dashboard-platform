// ... imports
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { WidgetBuilderComponent } from './widget-builder.component';
import {
  DashboardsService,
  ExecutionService,
  TemplatesService,
  WidgetResponse,
  TemplateResponse,
} from '../../api-client';
import { DashboardStore } from '../dashboard.store';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { DynamicFormComponent } from '../template-wizard/dynamic-form.component';
import { SqlBuilderComponent } from '../../editors/sql-builder.component';
import { HttpConfigComponent } from '../../editors/http-config.component';
import { TextEditorComponent } from '../../editors/text-editor.component';
import { WidgetComponent } from '../../widget/widget.component';

import { resolveComponentResourcesForTests } from '../../../test-utils/component-resources';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

// Mocks
const MOCK_TEMPLATE: TemplateResponse = {
  id: 't1',
  title: 'Admissions',
  category: 'Ops',
  sql_template: 'SELECT 1',
  parameters_schema: {},
};
const MOCK_DRAFT: WidgetResponse = {
  id: 'draft-1',
  dashboard_id: 'd1',
  title: 'New Widget',
  type: 'SQL',
  visualization: 'table',
  config: { query: 'SELECT 1' },
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
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn().mockReturnValue(of({})),
    };
    mockTplApi = {
      listTemplatesApiV1TemplatesGet: vi.fn().mockReturnValue(of([MOCK_TEMPLATE])),
    };
    mockDialogRef = { close: vi.fn() };
    mockStore = {
      dataMap: signal({ 'draft-1': { columns: ['A', 'B'] } }),
      refreshWidget: vi.fn(),
      loadDashboard: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [WidgetBuilderComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
        { provide: TemplatesService, useValue: mockTplApi },
        { provide: DashboardStore, useValue: mockStore },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'd1' } },
      ],
    })
      // Replace complex children with schema bypass
      .overrideComponent(WidgetBuilderComponent, {
        remove: {
          imports: [
            DynamicFormComponent,
            SqlBuilderComponent,
            HttpConfigComponent,
            TextEditorComponent,
            WidgetComponent,
          ],
        },
        add: { schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    await resolveComponentResourcesForTests();

    fixture = TestBed.createComponent(WidgetBuilderComponent);
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
      sql_template: 'SELECT 1',
    } as TemplateResponse);

    expect(component.selectedTemplateId()).toBe('t2');
    expect(component.paramsSchema()).toEqual({});
  });

  it('should save widget with template title', () => {
    component.templates.set([MOCK_TEMPLATE]);
    component.selectTemplate(MOCK_TEMPLATE);

    // Simulate the flow: Data setup
    component.draftWidget.set(MOCK_DRAFT);
    component.selectionForm.patchValue({ mode: 'predefined' });

    // Critical: Widget builder usually sets title in initializeDraft.
    // Here we manually set it to verify save uses the form control.
    component.titleControl.setValue(MOCK_TEMPLATE.title);

    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
    (component as any).finalSql.set('SELECT 1');

    component.saveWidget();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        title: 'Admissions', // Verified match
        config: { query: 'SELECT 1' },
      }),
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });
});
