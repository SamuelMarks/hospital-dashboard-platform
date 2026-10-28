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
import { LOCAL_DRAFT_WIDGET_ID } from './widget-builder.store';
import {
  AiService,
  DashboardsService,
  ExecutionService,
  TemplatesService,
  WidgetResponse,
  TemplateResponse,
} from '../../api-client';
import { DashboardStore } from '../dashboard.store';
import {
  ProcessorCatalogService,
  SQL_NO_MODEL_OPTION,
} from '../../shared/services/processor-catalog.service';
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
  let mockAiApi: {
    executeSqlPreviewApiV1AiExecutePost: ReturnType<typeof vi.fn>;
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
    mockAiApi = {
      executeSqlPreviewApiV1AiExecutePost: vi
        .fn()
        .mockReturnValue(of({ columns: ['A', 'B'], data: [{ A: 1, B: 2 }], error: null })),
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
        { provide: AiService, useValue: mockAiApi },
        { provide: TemplatesService, useValue: mockTplApi },
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
    expect(component.visualizations.some((v) => v.id === 'pie_chart')).toBe(true);
    expect(component.visualizations.some((v) => v.id === 'line_chart')).toBe(true);
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

  it('DestroyRef should tear down searchQuery subscription when fixture is destroyed', () => {
    vi.useFakeTimers();
    fixture.destroy();
    mockTplApi.listTemplatesApiV1TemplatesGet.mockClear();
    const input = document.createElement('input');
    input.value = 'after-destroy';
    const event = new Event('input');
    Object.defineProperty(event, 'target', { value: input });
    component.updateSearch(event);
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).not.toHaveBeenCalled();
  });

  it('updateSearch should trigger debounced searchQuery signal', () => {
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

  it('renderPreview should replace params in sql template and call single-query preview execution', () => {
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    component.draftWidget.set(MOCK_DRAFT);
    component.renderPreview();
    expect(component.finalSql()).toBe('SELECT 123 FROM table');
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).toHaveBeenCalledWith({
      sql: 'SELECT 123 FROM table',
    });
  });

  it('executeDraft should handle execution error', () => {
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    component.draftWidget.set(MOCK_DRAFT);
    mockAiApi.executeSqlPreviewApiV1AiExecutePost.mockReturnValue(
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

  it('initializeDraft should keep draft in client memory across template, SQL, HTTP, and TEXT modes', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.activeMode.set('template');
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.initializeDraft(mockStepper);
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
    expect(component.draftWidget()).toEqual(
      expect.objectContaining({
        id: LOCAL_DRAFT_WIDGET_ID,
        title: 'Admissions',
        type: 'SQL',
        config: { query: 'SELECT {{param}} FROM table' },
      }),
    );
    expect(mockStepper.next).toHaveBeenCalled();

    component.activeMode.set('custom');
    component.selectedTemplate.set(null);
    component.selectedCustomType.set('SQL');
    component.initializeDraft();
    expect(component.draftWidget()?.config).toEqual({
      query: 'SELECT * FROM hospital_data LIMIT 5',
    });

    component.selectedCustomType.set('HTTP');
    component.initializeDraft();
    expect(component.draftWidget()?.visualization).toBe('metric');

    component.selectedCustomType.set('TEXT');
    component.initializeDraft();
    expect(component.draftWidget()?.visualization).toBe('markdown');
  });

  it('runTemplateQuery should do nothing if no draft or template', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(null);
    component.runTemplateQuery(mockStepper);
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).not.toHaveBeenCalled();
  });

  it('runTemplateQuery should compile sql, execute single-query preview and call stepper next', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(MOCK_DRAFT);
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    component.runTemplateQuery(mockStepper);
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).toHaveBeenCalledWith({
      sql: 'SELECT 123 FROM table',
    });
    expect(mockStepper.next).toHaveBeenCalled();
  });

  it('runTemplateQuery should handle error', () => {
    const mockStepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    component.draftWidget.set(MOCK_DRAFT);
    component.selectedTemplate.set(MOCK_TEMPLATE);
    component.templateParams.set({ param: '123' });
    mockAiApi.executeSqlPreviewApiV1AiExecutePost.mockReturnValue(
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

  it('onSqlChange, onConfigChange, onContentChange, and updateVizType update draftWidget', () => {
    component.draftWidget.set(MOCK_DRAFT);
    expect(component.draftSqlQuery()).toBe('SELECT 1');
    expect(component.draftTextContent()).toBe('');

    component.onSqlChange('SELECT 2');
    expect(component.draftWidget()?.config['query']).toBe('SELECT 2');
    expect(component.draftSqlQuery()).toBe('SELECT 2');

    component.onConfigChange({ url: 'http://test' });
    expect(component.draftWidget()?.config['url']).toBe('http://test');

    component.onContentChange('content');
    expect(component.draftWidget()?.config['content']).toBe('content');
    expect(component.draftTextContent()).toBe('content');

    component.updateVizType('bar_chart');
    expect(component.draftWidget()?.visualization).toBe('bar_chart');

    component.draftWidget.set(null);
    expect(component.draftSqlQuery()).toBe('');
    expect(component.draftTextContent()).toBe('');
    component.onSqlChange('SELECT 2');
    component.onConfigChange({ url: 'http://test' });
    component.onContentChange('content');
    component.updateVizType('bar_chart');
    expect(component.draftWidget()).toBeNull();
  });

  it('saveWidget creates new widget for local draft or updates existing server widget and closes dialog', () => {
    component.draftWidget.set(null);
    component.saveWidget();
    component.saveAndClose();
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();

    // Persisting in-memory draft calls createWidget
    component.selectCustomType('SQL');
    component.initializeDraft();
    component.updateTitle('New Local Widget');
    component.saveWidget();
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        title: 'New Local Widget',
        type: 'SQL',
      }),
    );

    // Persisting existing server widget calls updateWidget
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
    expect(consoleSpy).toHaveBeenCalledWith('Failed to save widget', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('cancel should close dialog without deleting local draft, and delete server draft if present', () => {
    component.selectCustomType('SQL');
    component.initializeDraft();
    component.cancel();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).not.toHaveBeenCalled();
    expect(mockDialogRef.close).toHaveBeenCalledWith(false);

    component.draftWidget.set(MOCK_DRAFT);
    component.cancel();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith(
      'draft-1',
    );

    Object.defineProperty(document, 'activeElement', { value: null, configurable: true });
    const f2 = TestBed.createComponent(WidgetBuilderComponent);
    f2.componentInstance.restoreTriggerFocus();
    delete (document as unknown as Record<string, unknown>)['activeElement'];
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
    component.executionResult.set(null);
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

    component.draftWidget.set({ ...MOCK_DRAFT, type: 'SQL', visualization: 'pie_chart' });
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

  it('should update natural text and processor settings in previewWidget', () => {
    component.draftWidget.set({
      id: 'w-nl',
      dashboard_id: 'd1',
      title: 'Draft',
      type: 'SQL',
      visualization: 'table',
      config: { query: 'SELECT 1' },
    });
    component.updateAllowNaturalText(true);
    component.updateProcessor('ollama:llama3');
    component.updateNaturalTextPrompt('  Count patients  ');
    component.updatePlaceholderText('  Enter question  ');

    const preview = component.previewWidget();
    expect(preview?.config['allow_natural_text']).toBe(true);
    expect(preview?.config['processor']).toBe('ollama:llama3');
    expect(preview?.config['natural_text_prompt']).toBe('Count patients');
    expect(preview?.config['placeholder_text']).toBe('Enter question');

    component.updateNaturalTextPrompt('   ');
    component.updatePlaceholderText('');
    const previewEmpty = component.previewWidget();
    expect(previewEmpty?.config['natural_text_prompt']).toBeUndefined();
    expect(previewEmpty?.config['placeholder_text']).toBeUndefined();
  });
});
