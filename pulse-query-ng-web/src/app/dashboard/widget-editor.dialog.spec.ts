/**
 * @fileoverview Unit tests for WidgetEditorDialog.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input, output, signal, NO_ERRORS_SCHEMA } from '@angular/core';
import { WidgetEditorDialog, WidgetEditorData } from './widget-editor.dialog';
import { WidgetResponse, DashboardsService, DashboardResponse } from '../api-client';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { HttpConfigComponent } from '../editors/http-config.component';
import { DashboardStore } from './dashboard.store';
import {
  ProcessorCatalogService,
  SQL_NO_MODEL_OPTION,
} from '../shared/services/processor-catalog.service';
import { of } from 'rxjs';
import { readTemplate } from '../../test-utils/component-resources';
import { createMockInputEvent } from '../../test-utils/mock-factories';
import { vi } from 'vitest';

/** Mock SQL builder component for unit testing `WidgetEditorDialog`. */
@Component({
  selector: 'app-sql-builder',
  template: '<div data-testid="mock-sql-builder"></div>',
})
class MockSqlBuilderComponent {
  /** Dashboard ID input. */
  readonly dashboardId = input<string | undefined>();
  /** Widget ID input. */
  readonly widgetId = input<string | undefined>();
  /** Initial SQL input. */
  readonly initialSql = input<string | undefined>();
  /** SQL change output. */
  readonly sqlChange = output<string>();
}

/** Mock HTTP config component for unit testing `WidgetEditorDialog`. */
@Component({
  selector: 'app-http-config',
  template: '<div data-testid="mock-http-config"></div>',
})
class MockHttpConfigComponent {
  /** Dashboard ID input. */
  readonly dashboardId = input<string | undefined>();
  /** Widget ID input. */
  readonly widgetId = input<string | undefined>();
  /** Initial config input. */
  readonly initialConfig = input<Record<string, unknown> | undefined>();
  /** Config change output. */
  readonly configChange = output<Record<string, unknown>>();
}

describe('WidgetEditorDialog', () => {
  let component: WidgetEditorDialog;
  let fixture: ComponentFixture<WidgetEditorDialog>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockDashApi: {
    getDashboardApiV1DashboardsDashboardIdGet: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    loadDashboard: ReturnType<typeof vi.fn>;
    dataMap: ReturnType<typeof signal<Record<string, { columns?: string[] }>>>;
  };

  const makeSqlWidget = (): WidgetResponse => ({
    id: 'w1',
    dashboard_id: 'd1',
    title: 'SQL',
    type: 'SQL',
    visualization: 'bar_chart',
    config: { query: 'SELECT 1', xKey: 'x', yKey: 'y' },
  });
  let sqlWidget: WidgetResponse;
  let mockData: WidgetEditorData;

  beforeEach(async () => {
    sqlWidget = makeSqlWidget();
    mockData = { dashboardId: 'd1', widget: sqlWidget };
    mockDialogRef = { close: vi.fn() };
    mockDashApi = {
      getDashboardApiV1DashboardsDashboardIdGet: vi.fn(),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})),
    };
    mockStore = {
      loadDashboard: vi.fn(),
      dataMap: signal({ w1: { columns: ['x', 'y'] } }),
    };

    await TestBed.configureTestingModule({
      imports: [WidgetEditorDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: mockData },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: DashboardStore, useValue: mockStore },
        {
          provide: ProcessorCatalogService,
          useValue: {
            processors: signal([SQL_NO_MODEL_OPTION]),
            sqlProcessors: signal([SQL_NO_MODEL_OPTION]),
            ollamaProcessors: signal([
              {
                id: 'ollama:llama3',
                name: 'Llama 3',
                provider: 'ollama',
                isLocal: true,
                category: 'OLLAMA',
              },
            ]),
            anyLlmProcessors: signal([
              {
                id: 'openai:gpt-4o',
                name: 'GPT-4o',
                provider: 'openai',
                isLocal: false,
                category: 'ANY_LLM',
              },
            ]),
            loadProcessors: vi.fn(),
          },
        },
      ],
    })
      .overrideComponent(WidgetEditorDialog, {
        remove: { imports: [SqlBuilderComponent, HttpConfigComponent] },
        add: { imports: [MockSqlBuilderComponent, MockHttpConfigComponent] },
      })
      .overrideComponent(WidgetEditorDialog, {
        set: {
          template: readTemplate('./widget-editor.dialog.html'),
          templateUrl: undefined,
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(WidgetEditorDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render SQL editor', () => {
    const sqlBuilder = fixture.debugElement.query(By.css('[data-testid="mock-sql-builder"]'));
    expect(sqlBuilder).toBeTruthy();
    expect(component.initialSql()).toBe('SELECT 1');
  });

  it('should render HTTP editor for HTTP widgets', () => {
    component.data.widget = { ...sqlWidget, type: 'HTTP' };
    fixture.detectChanges();

    const httpBuilder = fixture.debugElement.query(By.css('[data-testid="mock-http-config"]'));
    expect(httpBuilder).toBeTruthy();
  });

  it('should initialize xKey/yKey from config', () => {
    expect(component.xKey()).toBe('x');
    expect(component.yKey()).toBe('y');
  });

  it('should default xKey/yKey to null when config keys are absent', () => {
    const emptyConfigWidget: WidgetResponse = { ...sqlWidget, config: {} };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'd1', widget: emptyConfigWidget } },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: DashboardStore, useValue: mockStore },
        {
          provide: ProcessorCatalogService,
          useValue: {
            processors: signal([SQL_NO_MODEL_OPTION]),
            sqlProcessors: signal([SQL_NO_MODEL_OPTION]),
            ollamaProcessors: signal([]),
            anyLlmProcessors: signal([]),
            loadProcessors: vi.fn(),
          },
        },
      ],
    });

    const inst = TestBed.runInInjectionContext(() => new WidgetEditorDialog());

    expect(inst.xKey()).toBeNull();
    expect(inst.yKey()).toBeNull();
    expect(inst.allowNaturalText()).toBe(false);
    expect(inst.processor()).toBe('SQL');
    expect(inst.naturalTextPrompt()).toBe('');
    expect(inst.placeholderText()).toBe('');
  });

  it('should compute mapping helpers and columns', () => {
    expect(component.supportsMapping()).toBe(true);
    expect(component.isPie()).toBe(false);
    expect(component.columns()).toEqual(['x', 'y']);

    mockStore.dataMap.set({});
    fixture.detectChanges();
    expect(component.columns()).toEqual([]);
  });

  it('should detect pie visualization', () => {
    component.data.widget.visualization = 'pie';
    fixture.detectChanges();
    expect(component.isPie()).toBe(true);
  });

  it('should fallback initialSql when query missing', () => {
    const noQueryWidget: WidgetResponse = { ...sqlWidget, config: {} };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'd1', widget: noQueryWidget } },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: DashboardStore, useValue: mockStore },
        {
          provide: ProcessorCatalogService,
          useValue: {
            processors: signal([SQL_NO_MODEL_OPTION]),
            sqlProcessors: signal([SQL_NO_MODEL_OPTION]),
            ollamaProcessors: signal([]),
            anyLlmProcessors: signal([]),
            loadProcessors: vi.fn(),
          },
        },
      ],
    });

    const inst = TestBed.runInInjectionContext(() => new WidgetEditorDialog());

    expect(inst.initialSql()).toBe('');
  });

  it('should report mapping unsupported for table', () => {
    component.data.widget.visualization = 'table';
    fixture.detectChanges();
    expect(component.supportsMapping()).toBe(false);
  });

  it('should report mapping unsupported when visualization is empty string', () => {
    component.data.widget.visualization = '';
    fixture.detectChanges();
    expect(component.supportsMapping()).toBe(false);
  });

  it('should reload dashboard on editor save', () => {
    component.handleEditorSave();
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should save settings and close dialog', () => {
    const freshDash: DashboardResponse = {
      id: 'd1',
      name: 'Dash',
      owner_id: 'u1',
      widgets: [{ ...sqlWidget, config: { query: 'SELECT 2' } }],
    };
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(freshDash));

    component.xKey.set('x');
    component.yKey.set('y');
    component.saveSettings();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        config: expect.objectContaining({ xKey: 'x', yKey: 'y' }) as unknown,
      }),
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should trigger editor save handlers from template outputs', () => {
    const spy = vi.spyOn(component, 'handleEditorSave');
    const sqlBuilder = fixture.debugElement.query(By.directive(MockSqlBuilderComponent));
    expect(sqlBuilder).toBeTruthy();
    sqlBuilder.triggerEventHandler('sqlChange', 'SELECT 2');
    expect(spy).toHaveBeenCalled();

    component.data.widget = { ...sqlWidget, type: 'HTTP' };
    fixture.detectChanges();
    const httpConfig = fixture.debugElement.query(By.directive(MockHttpConfigComponent));
    expect(httpConfig).toBeTruthy();
    httpConfig.triggerEventHandler('configChange', { url: 'http://x' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should allow mapping selection and save from template', () => {
    const saveSpy = vi.spyOn(component, 'saveSettings').mockImplementation(() => {});
    component.data.widget.visualization = 'bar_chart';
    mockStore.dataMap.set({ w1: { columns: ['x', 'y'] } });
    fixture.detectChanges();
    const selects = fixture.debugElement.queryAll(By.css('mat-select'));
    expect(selects.length).toBeGreaterThanOrEqual(2);
    selects[0]?.triggerEventHandler('ngModelChange', 'x');
    selects[1]?.triggerEventHandler('ngModelChange', 'y');

    const updateBtn = fixture.debugElement.query(By.css('button[mat-flat-button]'));
    updateBtn.triggerEventHandler('click', null);
    expect(saveSpy).toHaveBeenCalled();
  });

  it('should render empty-columns message when no columns', () => {
    component.data.widget.visualization = 'bar_chart';
    mockStore.dataMap.set({ w1: { columns: [] } });
    fixture.detectChanges();
    const message = fixture.debugElement.query(By.css('.text-amber-700'));
    expect(message).toBeTruthy();
  });

  it('should save settings when config is empty', () => {
    const widgetWithoutConfig: WidgetResponse = { ...sqlWidget, config: {} };
    const freshDash: DashboardResponse = {
      id: 'd1',
      name: 'Dash',
      owner_id: 'u1',
      widgets: [widgetWithoutConfig],
    };
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(freshDash));

    component.xKey.set('x');
    component.yKey.set('y');
    component.saveSettings();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({ config: { xKey: 'x', yKey: 'y' } }),
    );
  });

  it('should skip save when widget missing', () => {
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(
      of({ id: 'd1', name: 'Dash', owner_id: 'u1', widgets: [] } satisfies DashboardResponse),
    );

    component.saveSettings();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should merge settings when fresh widget has no config', () => {
    const freshDash: DashboardResponse = {
      id: 'd1',
      name: 'Dash',
      owner_id: 'u1',
      widgets: [
        {
          id: 'w1',
          dashboard_id: 'd1',
          title: 'SQL',
          type: 'SQL',
          visualization: 'bar_chart',
          config: {},
        },
      ],
    };
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(freshDash));

    component.xKey.set('x');
    component.yKey.set('y');
    component.saveSettings();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        config: expect.objectContaining({ xKey: 'x', yKey: 'y' }) as unknown,
      }),
    );
  });

  it('should initialize and persist natural text and processor settings', () => {
    const nlWidget: WidgetResponse = {
      ...sqlWidget,
      config: {
        query: 'SELECT 1',
        allow_natural_text: true,
        processor: 'ollama:llama3',
        natural_text_prompt: 'Initial prompt',
        placeholder_text: 'Custom placeholder',
      },
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { dashboardId: 'd1', widget: nlWidget } },
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: DashboardStore, useValue: mockStore },
        {
          provide: ProcessorCatalogService,
          useValue: {
            processors: signal([SQL_NO_MODEL_OPTION]),
            sqlProcessors: signal([SQL_NO_MODEL_OPTION]),
            ollamaProcessors: signal([]),
            anyLlmProcessors: signal([]),
            loadProcessors: vi.fn(),
          },
        },
      ],
    });

    const nlInst = TestBed.runInInjectionContext(() => new WidgetEditorDialog());
    nlInst.ngOnInit();

    expect(nlInst.allowNaturalText()).toBe(true);
    expect(nlInst.processor()).toBe('ollama:llama3');
    expect(nlInst.naturalTextPrompt()).toBe('Initial prompt');
    expect(nlInst.placeholderText()).toBe('Custom placeholder');

    const fakeEvent = createMockInputEvent('Updated prompt');
    expect(nlInst.getEventValue(fakeEvent)).toBe('Updated prompt');
    nlInst.naturalTextPrompt.set('Updated prompt');
    nlInst.placeholderText.set('Updated placeholder');

    const freshDash: DashboardResponse = {
      id: 'd1',
      name: 'Dash',
      owner_id: 'u1',
      widgets: [nlWidget],
    };
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(freshDash));
    nlInst.saveSettings();

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'w1',
      expect.objectContaining({
        config: expect.objectContaining({
          allow_natural_text: true,
          processor: 'ollama:llama3',
          natural_text_prompt: 'Updated prompt',
          placeholder_text: 'Updated placeholder',
        }) as unknown,
      }),
    );

    // Also test when prompt and placeholder are blank
    nlInst.naturalTextPrompt.set('  ');
    nlInst.placeholderText.set('');
    nlInst.saveSettings();
  });
});
