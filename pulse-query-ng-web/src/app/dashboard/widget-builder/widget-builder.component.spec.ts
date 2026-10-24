/**
 * @fileoverview Unit tests for `WidgetBuilderComponent`.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatStepper } from '@angular/material/stepper';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { WidgetBuilderComponent } from './widget-builder.component';
import {
  DashboardsService,
  ExecutionService,
  TemplatesService,
  WidgetResponse,
  TemplateResponse,
} from '../../api-client';
import { DashboardStore } from '../dashboard.store';
import { SqlBuilderComponent } from '../../editors/sql-builder.component';
import { HttpConfigComponent } from '../../editors/http-config.component';
import { TextEditorComponent } from '../../editors/text-editor.component';
import { WidgetBuilderVisualizeStepComponent } from './widget-builder-visualize-step.component';
import { resolveComponentResourcesForTests } from '../../../test-utils/component-resources';

const MOCK_TEMPLATE: TemplateResponse = {
  id: 't1',
  title: 'Admissions',
  category: 'Ops',
  sql_template: 'SELECT {{param}} FROM table',
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

  let mockDashApi: {
    createWidgetApiV1DashboardsDashboardIdWidgetsPost: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
    deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: ReturnType<typeof vi.fn>;
  };
  let mockExecApi: {
    refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn>;
  };
  let mockTplApi: {
    listTemplatesApiV1TemplatesGet: ReturnType<typeof vi.fn>;
  };
  let mockDialogRef: {
    close: ReturnType<typeof vi.fn>;
    getState: ReturnType<typeof vi.fn>;
  };
  let mockStore: {
    dataMap: ReturnType<typeof signal<Record<string, { columns?: string[] }>>>;
    refreshWidget: ReturnType<typeof vi.fn>;
    loadDashboard: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn().mockReturnValue(of(MOCK_DRAFT)),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi
        .fn()
        .mockReturnValue(of({ 'draft-1': { data: 'test' } })),
    };
    mockTplApi = {
      listTemplatesApiV1TemplatesGet: vi.fn().mockReturnValue(of([MOCK_TEMPLATE])),
    };
    mockDialogRef = { close: vi.fn(), getState: vi.fn().mockReturnValue(0) };
    mockStore = {
      dataMap: signal({ 'draft-1': { columns: ['A', 'B'] } }),
      refreshWidget: vi.fn(),
      loadDashboard: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [WidgetBuilderComponent],
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
      .overrideComponent(WidgetBuilderComponent, {
        remove: {
          imports: [
            SqlBuilderComponent,
            HttpConfigComponent,
            TextEditorComponent,
            WidgetBuilderVisualizeStepComponent,
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

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize and load templates', () => {
    expect(component).toBeTruthy();
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).toHaveBeenCalled();
    expect(component.templates().length).toBe(1);
  });

  it('should sync local controls with previewWidget state on value changes', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.updateTitle('Updated Title');
    fixture.detectChanges();
    expect(component.previewWidget()?.title).toBe('Updated Title');

    component.updateTitle('');
    expect(component.previewWidget()?.title).toBe('New Widget');
  });

  it('should sync local controls with previewWidget and syncVizConfig for xKey/yKey', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.updateXKey('x_col');
    fixture.detectChanges();
    expect(component.previewWidget()?.config['xKey']).toBe('x_col');
    component.updateYKey('y_col');
    fixture.detectChanges();
    expect(component.previewWidget()?.config['yKey']).toBe('y_col');

    component.syncVizConfig('x_col', 'y_col');
    expect(component.draftWidget()?.config['xKey']).toBe('x_col');
    expect(component.draftWidget()?.config['yKey']).toBe('y_col');
    component.syncVizConfig('x_col', 'y_col');
    expect(component.draftWidget()?.config['xKey']).toBe('x_col');
  });

  it('syncVizConfig should do nothing if no draft widget', () => {
    component.draftWidget.set(null);
    component.syncVizConfig(null, null);
    expect(component.draftWidget()).toBeNull();
  });

  it('ngOnDestroy should unsubscribe and handle draft cleanup logic if needed', () => {
    component.draftWidget.set(MOCK_DRAFT);
    mockDialogRef.getState.mockReturnValue(0);
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  it('ngOnDestroy should do nothing if called before ngOnInit', () => {
    const uninit = TestBed.runInInjectionContext(() => new WidgetBuilderComponent());
    expect(() => uninit.ngOnDestroy()).not.toThrow();
  });

  it('updateSearch should trigger search$', () => {
    vi.useFakeTimers();
    const input = document.createElement('input');
    input.value = 'search term';
    const event = new Event('input');
    Object.defineProperty(event, 'target', { value: input });
    component.updateSearch(event);
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).toHaveBeenCalledWith(
      undefined,
      'search term',
    );
  });

  it('toggleCategory should toggle category filter and reload templates', () => {
    component.toggleCategory('Ops');
    expect(component.selectedCategory()).toBe('Ops');
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).toHaveBeenCalledWith('Ops', undefined);

    component.toggleCategory('Ops');
    expect(component.selectedCategory()).toBeNull();
  });

  it('selectTemplate should set template mode and select template', () => {
    component.selectTemplate(MOCK_TEMPLATE);
    expect(component.selectedTemplate()).toEqual(MOCK_TEMPLATE);
    expect(component.activeMode()).toBe('template');
    expect(component.selectedCustomType()).toBeNull();
    expect(component.getTemplateAriaLabel(MOCK_TEMPLATE)).toBe('Select template: Admissions');
  });

  it('selectCustomType should set custom mode and select type', () => {
    component.selectCustomType('HTTP');
    expect(component.selectedCustomType()).toBe('HTTP');
    expect(component.activeMode()).toBe('custom');
    expect(component.selectedTemplate()).toBeNull();
  });

  it('parseParams should reset params and set valid to true if mode is not predefined', () => {
    component.activeMode.set('custom');
    component.templateParams.set({ a: 1 });
    component.templateFormValid.set(false);
    component.parseParams();
    expect(component.templateParams()).toEqual({});
    expect(component.templateFormValid()).toBe(true);
  });

  it('parseParams should do nothing if mode is predefined', () => {
    component.activeMode.set('template');
    component.templateParams.set({ a: 1 });
    component.templateFormValid.set(false);
    component.parseParams();
    expect(component.templateParams()).toEqual({ a: 1 });
    expect(component.templateFormValid()).toBe(false);
  });

  it('renderPreview should do nothing if no template selected', () => {
    component.selectedTemplate.set(null);
    component.renderPreview();
    expect(component.finalSql()).toBe('');
  });

  it('renderPreview should replace params in sql template and call executeDraft', () => {
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    component.draftWidget.set(MOCK_DRAFT);
    component.renderPreview();
    expect(component.finalSql()).toBe('SELECT 123 FROM table');
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'draft-1',
      { config: { query: 'SELECT 123 FROM table' } },
    );
    expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalled();
  });

  it('executeDraft should handle execution error', () => {
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    component.draftWidget.set(MOCK_DRAFT);
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('error')),
    );
    component.renderPreview();
    expect(component.isBusy()).toBe(false);
  });

  it('handleFormChange should update templateParams', () => {
    component.handleFormChange({ key: 'val' });
    expect(component.templateParams()).toEqual({ key: 'val' });
  });

  it('handleStatusChange should update templateFormValid', () => {
    component.handleStatusChange('VALID');
    expect(component.templateFormValid()).toBe(true);
    component.handleStatusChange('INVALID');
    expect(component.templateFormValid()).toBe(false);
  });

  it('initializeDraft should handle template mode', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.activeMode.set('template');
    component.selectedTemplate.set(MOCK_TEMPLATE);
    vi.useFakeTimers();
    component.initializeDraft(mockStepper);
    vi.advanceTimersByTime(150);
    vi.useRealTimers();

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        title: 'Admissions',
        type: 'SQL',
        config: { query: 'SELECT {{param}} FROM table' },
      }),
    );
    expect(mockStepper.next).toHaveBeenCalled();
  });

  it('initializeDraft should handle custom SQL mode', () => {
    component.activeMode.set('custom');
    component.selectedCustomType.set('SQL');
    component.initializeDraft();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        type: 'SQL',
        config: { query: 'SELECT * FROM hospital_data LIMIT 5' },
      }),
    );
  });

  it('initializeDraft should handle custom HTTP mode', () => {
    component.activeMode.set('custom');
    component.selectedCustomType.set('HTTP');
    component.initializeDraft();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        type: 'HTTP',
        visualization: 'metric',
        config: { url: 'https://example.com', method: 'GET' },
      }),
    );
  });

  it('initializeDraft should handle custom TEXT mode', () => {
    component.activeMode.set('custom');
    component.selectedCustomType.set('TEXT');
    component.initializeDraft();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        type: 'TEXT',
        visualization: 'markdown',
        config: {
          content: `### New Text Widget
Edit this content.`,
        },
      }),
    );
  });

  it('initializeDraft should log error if creation fails', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
      throwError(() => new Error('err')),
    );
    component.activeMode.set('custom');
    component.selectedCustomType.set('SQL');
    component.initializeDraft();
    expect(consoleSpy).toHaveBeenCalledWith('Draft creation failed', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('runTemplateQuery should do nothing if no draft or template', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(null);
    component.runTemplateQuery(mockStepper);
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('runTemplateQuery should compile sql, execute update and call stepper next', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(MOCK_DRAFT);
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    component.runTemplateQuery(mockStepper);
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'draft-1',
      { config: { query: 'SELECT 123 FROM table' } },
    );
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('draft-1');
    expect(mockStepper.next).toHaveBeenCalled();
  });

  it('runTemplateQuery should handle error', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(MOCK_DRAFT);
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('err')),
    );
    component.runTemplateQuery(mockStepper);
    expect(component.isBusy()).toBe(false);
  });

  it('validateDataPresence should refresh widget and call next', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(MOCK_DRAFT);
    component.validateDataPresence(mockStepper);
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('draft-1');
    expect(mockStepper.next).toHaveBeenCalled();
  });

  it('validateDataPresence should only call next if no draft', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(null);
    component.validateDataPresence(mockStepper);
    expect(mockStore.refreshWidget).not.toHaveBeenCalled();
    expect(mockStepper.next).toHaveBeenCalled();
  });

  it('onSqlChange should update draft config query', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.onSqlChange('SELECT 2');
    expect(component.draftWidget()?.config['query']).toBe('SELECT 2');
  });

  it('onSqlChange should do nothing if no draft', () => {
    component.draftWidget.set(null);
    component.onSqlChange('SELECT 2');
    expect(component.draftWidget()).toBeNull();
  });

  it('onConfigChange should update draft config', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.onConfigChange({ url: 'http://test' });
    expect(component.draftWidget()?.config['url']).toBe('http://test');
  });

  it('onConfigChange should do nothing if no draft', () => {
    component.draftWidget.set(null);
    component.onConfigChange({ url: 'http://test' });
    expect(component.draftWidget()).toBeNull();
  });

  it('onContentChange should update draft config content', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.onContentChange('content');
    expect(component.draftWidget()?.config['content']).toBe('content');
  });

  it('onContentChange should do nothing if no draft', () => {
    component.draftWidget.set(null);
    component.onContentChange('content');
    expect(component.draftWidget()).toBeNull();
  });

  it('updateVizType should update draft visualization', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.updateVizType('bar_chart');
    expect(component.draftWidget()?.visualization).toBe('bar_chart');
  });

  it('updateVizType should do nothing if no draft', () => {
    component.draftWidget.set(null);
    component.updateVizType('bar_chart');
    expect(component.draftWidget()).toBeNull();
  });

  it('saveWidget should do nothing if no draft widget', () => {
    component.draftWidget.set(null);
    component.saveWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('saveWidget should update widget and close dialog', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.updateTitle('New Title');
    fixture.detectChanges();
    component.saveWidget();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'draft-1',
      {
        title: 'New Title',
        visualization: 'table',
        config: { query: 'SELECT 1', xKey: null, yKey: null },
      },
    );
    expect(component.draftWidget()).toBeNull();
    expect(mockDialogRef.close).toHaveBeenCalledWith(true);
  });

  it('saveWidget should handle error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    component.draftWidget.set(MOCK_DRAFT);
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('err')),
    );
    component.saveWidget();
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('cancel should close dialog without draft', () => {
    component.draftWidget.set(null);
    component.cancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('cancel should delete draft and close dialog', () => {
    component.draftWidget.set(MOCK_DRAFT);
    component.cancel();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith(
      'draft-1',
    );
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);
  });

  it('asTableData should return normalized table data object or default', () => {
    expect(component.asTableData(null)).toEqual({ columns: [], data: [] });
    component.executionResult.set({ columns: ['c1'], data: [{ c1: 42 }] });
    expect(component.previewTableData()).toEqual({ columns: ['c1'], data: [{ c1: 42 }] });
    expect(component.asTableData({ columns: ['a'], data: [{ a: 1 }] })).toEqual({
      columns: ['a'],
      data: [{ a: 1 }],
    });
    expect(component.asTableData({})).toEqual({ columns: [], data: [] });
  });

  it('should compute showAxesConfig, isPie, availableColumns, and dataConfigured branches', () => {
    component.draftWidget.set(null);
    component.selectedTemplate.set(null);
    expect(component.paramsSchema()).toEqual({});
    expect(component.currentType()).toBe('SQL');
    expect(component.showAxesConfig()).toBe(false);
    expect(component.availableColumns()).toEqual([]);

    component.selectedTemplate.set({
      ...MOCK_TEMPLATE,
      parameters_schema: { type: 'object' },
    });
    expect(component.paramsSchema()).toEqual({ type: 'object' });

    component.draftWidget.set({ ...MOCK_DRAFT, type: 'TEXT', visualization: 'markdown' });
    expect(component.currentType()).toBe('TEXT');
    expect(component.showAxesConfig()).toBe(false);

    component.draftWidget.set({ ...MOCK_DRAFT, type: 'SQL', visualization: 'pie' });
    expect(component.showAxesConfig()).toBe(true);
    expect(component.isPie()).toBe(true);
    expect(component.availableColumns()).toEqual(['A', 'B']);

    mockStore.dataMap.set({});
    expect(component.availableColumns()).toEqual([]);

    component.activeMode.set('template');
    component.templateFormValid.set(false);
    expect(component.dataConfigured()).toBe(false);
    component.activeMode.set('custom');
    expect(component.dataConfigured()).toBe(true);
  });

  it('executeDraft should handle no draftId', () => {
    component.draftWidget.set(null);
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.renderPreview();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should do nothing on title changes if no draft', () => {
    component.draftWidget.set(null);
    component.updateTitle('Another Title');
    fixture.detectChanges();
    expect(component.draftWidget()).toBeNull();
  });
});
