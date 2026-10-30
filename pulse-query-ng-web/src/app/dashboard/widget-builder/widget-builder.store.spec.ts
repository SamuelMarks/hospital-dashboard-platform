/**
 * @fileoverview Unit tests for `WidgetBuilderStore`.
 */

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  AiService,
  DashboardsService,
  TemplateResponse,
  TemplatesService,
  WidgetResponse,
} from '../../api-client';
import { DashboardStore } from '../dashboard.store';
import { LOCAL_DRAFT_WIDGET_ID, WidgetBuilderStore } from './widget-builder.store';

const MOCK_TEMPLATE: TemplateResponse = {
  id: 't1',
  title: 'Admissions',
  category: 'Ops',
  sql_template: 'SELECT {{param}} FROM table',
  parameters_schema: { type: 'object' },
};

describe('WidgetBuilderStore', () => {
  let store: WidgetBuilderStore;
  let mockDashApi: {
    createWidgetApiV1DashboardsDashboardIdWidgetsPost: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
    deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: ReturnType<typeof vi.fn>;
  };
  let mockTplApi: {
    listTemplatesApiV1TemplatesGet: ReturnType<typeof vi.fn>;
  };
  let mockAiApi: {
    executeSqlPreviewApiV1AiExecutePost: ReturnType<typeof vi.fn>;
  };
  let mockDashboardStore: {
    dataMap: ReturnType<typeof signal<Record<string, { columns?: string[] }>>>;
    refreshWidget: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDashApi = {
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi
        .fn()
        .mockReturnValue(of({ id: 'w-created' })),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi
        .fn()
        .mockReturnValue(of({ id: 'w-updated' })),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
    };
    mockTplApi = {
      listTemplatesApiV1TemplatesGet: vi.fn().mockReturnValue(of([MOCK_TEMPLATE])),
    };
    mockAiApi = {
      executeSqlPreviewApiV1AiExecutePost: vi
        .fn()
        .mockReturnValue(of({ columns: ['col1'], data: [{ col1: 1 }], error: null })),
    };
    mockDashboardStore = {
      dataMap: signal({ 'server-1': { columns: ['A', 'B'] } }),
      refreshWidget: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        WidgetBuilderStore,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: TemplatesService, useValue: mockTplApi },
        { provide: AiService, useValue: mockAiApi },
        { provide: DashboardStore, useValue: mockDashboardStore },
      ],
    });

    store = TestBed.inject(WidgetBuilderStore);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads templates and debounces searchQuery updates', () => {
    vi.useFakeTimers();
    store.loadTemplates();
    expect(store.templates()).toEqual([MOCK_TEMPLATE]);

    store.setSearchQuery('census');
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    expect(mockTplApi.listTemplatesApiV1TemplatesGet).toHaveBeenCalledWith(undefined, 'census');

    store.toggleCategory('Clinical');
    expect(store.selectedCategory()).toBe('Clinical');
    store.toggleCategory('Clinical');
    expect(store.selectedCategory()).toBeNull();
  });

  it('selects template vs custom types and parses params', () => {
    expect(store.paramsSchema()).toEqual({});
    store.selectTemplate(MOCK_TEMPLATE);
    expect(store.activeMode()).toBe('template');
    expect(store.selectedTemplateId()).toBe('t1');
    expect(store.paramsSchema()).toEqual({ type: 'object' });

    store.templateParams.set({ k: 'v' });
    store.templateFormValid.set(false);
    expect(store.dataConfigured()).toBe(false);
    store.parseParams();
    expect(store.templateParams()).toEqual({ k: 'v' });

    store.selectCustomType('HTTP');
    expect(store.activeMode()).toBe('custom');
    expect(store.selectedCustomType()).toBe('HTTP');
    expect(store.dataConfigured()).toBe(true);
    store.parseParams();
    expect(store.templateParams()).toEqual({});
    expect(store.templateFormValid()).toBe(true);
  });

  it('initializes drafts in client memory without server persistence on step 1', () => {
    const stepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    store.selectTemplate(MOCK_TEMPLATE);
    store.initializeDraft('d1', stepper);
    expect(store.draftWidget()?.id).toBe(LOCAL_DRAFT_WIDGET_ID);
    expect(store.draftWidget()?.title).toBe('Admissions');
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
    expect(stepper.next).toHaveBeenCalled();

    store.selectCustomType('SQL');
    store.initializeDraft('d1');
    expect(store.draftWidget()?.type).toBe('SQL');

    store.selectCustomType('HTTP');
    store.initializeDraft('d1');
    expect(store.draftWidget()?.type).toBe('HTTP');
    expect(store.draftWidget()?.visualization).toBe('metric');

    store.selectCustomType('TEXT');
    store.initializeDraft('d1');
    expect(store.draftWidget()?.type).toBe('TEXT');
    expect(store.draftWidget()?.visualization).toBe('markdown');
  });

  it('executes single-query SQL preview via AiService and handles errors', () => {
    store.renderPreview();
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).not.toHaveBeenCalled();

    store.executeDraft('SELECT 1');
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).not.toHaveBeenCalled();

    store.selectTemplate(MOCK_TEMPLATE);
    store.templateParams.set({ param: '42' });
    store.initializeDraft('d1');
    store.renderPreview();
    expect(store.finalSql()).toBe('SELECT 42 FROM table');
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).toHaveBeenCalledWith({
      sql: 'SELECT 42 FROM table',
    });
    expect(store.availableColumns()).toEqual(['col1']);
    expect(store.previewTableData()).toEqual({ columns: ['col1'], data: [{ col1: 1 }] });

    mockAiApi.executeSqlPreviewApiV1AiExecutePost.mockReturnValueOnce(
      of({ columns: [], data: [], error: 'SQL syntax error' }),
    );
    store.executeDraft('SELECT bad');
    expect(store.executionResult()?.error).toBe('SQL syntax error');

    mockAiApi.executeSqlPreviewApiV1AiExecutePost.mockReturnValueOnce(
      throwError(() => new Error('Network fail')),
    );
    store.executeDraft('SELECT fail');
    expect(store.isBusy()).toBe(false);
  });

  it('runs template query and validates data presence across local and persisted drafts', () => {
    const stepper: Pick<MatStepper, 'next'> = { next: vi.fn() };
    store.runTemplateQuery(stepper);
    expect(stepper.next).not.toHaveBeenCalled();

    store.selectTemplate(MOCK_TEMPLATE);
    store.templateParams.set({ param: '99' });
    store.initializeDraft('d1');
    store.runTemplateQuery(stepper);
    expect(stepper.next).toHaveBeenCalledTimes(1);

    mockAiApi.executeSqlPreviewApiV1AiExecutePost.mockReturnValueOnce(
      of({ columns: [], data: [], error: 'Syntax err' }),
    );
    store.runTemplateQuery(stepper);
    expect(store.executionResult()?.error).toBe('Syntax err');

    mockAiApi.executeSqlPreviewApiV1AiExecutePost.mockReturnValueOnce(
      throwError(() => new Error('Fail')),
    );
    store.runTemplateQuery(stepper);
    expect(store.isBusy()).toBe(false);

    // validateDataPresence on local SQL draft executes preview
    store.validateDataPresence(stepper);
    expect(mockAiApi.executeSqlPreviewApiV1AiExecutePost).toHaveBeenCalled();

    // validateDataPresence on local HTTP draft skips SQL preview
    store.selectCustomType('HTTP');
    store.initializeDraft('d1');
    store.validateDataPresence(stepper);

    // validateDataPresence on persisted server widget refreshes via DashboardStore
    const serverWidget: WidgetResponse = {
      id: 'server-1',
      dashboard_id: 'd1',
      title: 'Server Widget',
      type: 'SQL',
      visualization: 'pie_chart',
      config: { query: 'SELECT 1' },
    };
    store.draftWidget.set(serverWidget);
    store.executionResult.set(null);
    expect(store.availableColumns()).toEqual(['A', 'B']);
    expect(store.isPie()).toBe(true);
    expect(store.showAxesConfig()).toBe(true);
    store.validateDataPresence(stepper);
    expect(mockDashboardStore.refreshWidget).toHaveBeenCalledWith('server-1');

    store.draftWidget.set(null);
    expect(store.availableColumns()).toEqual([]);
    store.validateDataPresence(stepper);
  });

  it('saves in-memory drafts (SQL, HTTP, TEXT) via createWidget and persisted drafts via updateWidget', () => {
    const onSaved = vi.fn();
    store.saveAndClose('d1', onSaved);
    expect(onSaved).not.toHaveBeenCalled();

    // Save local SQL draft
    store.selectCustomType('SQL');
    store.initializeDraft('d1');
    store.allowNaturalText.set(true);
    store.selectedProcessor.set('ollama:llama3');
    store.naturalTextPrompt.set(' Count beds ');
    store.placeholderText.set(' Ask... ');
    store.saveAndClose('d1', onSaved);
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ type: 'SQL', title: 'New Widget' }),
    );
    expect(onSaved).toHaveBeenCalledTimes(1);

    // Save local HTTP draft with subtitle
    store.selectCustomType('HTTP');
    store.initializeDraft('d1');
    store.vizFormModel.update((m) => ({ ...m, title: '', subtitle: '  HTTP caption  ' }));
    expect(store.previewWidget()?.subtitle).toBe('HTTP caption');
    store.saveAndClose('d1', onSaved);
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ type: 'HTTP', subtitle: 'HTTP caption' }),
    );

    // Save local TEXT draft with subtitle
    store.selectCustomType('TEXT');
    store.initializeDraft('d1');
    store.vizFormModel.update((m) => ({ ...m, subtitle: '  Markdown note  ' }));
    store.saveAndClose('d1', onSaved);
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({
        type: 'TEXT',
        visualization: 'markdown',
        subtitle: 'Markdown note',
      }),
    );

    // Template with description pre-populates subtitle, and clearing subtitle removes it from previewWidget
    store.selectTemplate({ ...MOCK_TEMPLATE, description: '  Template desc  ' });
    store.initializeDraft('d1');
    expect(store.vizFormModel().subtitle).toBe('Template desc');
    store.vizFormModel.update((m) => ({ ...m, subtitle: '' }));
    expect(store.previewWidget()?.config['subtitle']).toBeUndefined();
    store.vizFormModel.update((m) => ({ ...m, subtitle: 'SQL sub' }));
    store.saveAndClose('d1', onSaved);

    // Error on createWidget
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValueOnce(
      throwError(() => new Error('Create failed')),
    );
    store.selectCustomType('SQL');
    store.initializeDraft('d1');
    store.saveAndClose('d1', onSaved);
    expect(errSpy).toHaveBeenCalled();

    // Save existing server widget via updateWidget
    store.draftWidget.set({
      id: 'server-1',
      dashboard_id: 'd1',
      title: 'Server Widget',
      type: 'SQL',
      visualization: 'table',
      config: { query: 'SELECT 1' },
    });
    store.vizFormModel.update((m) => ({ ...m, title: '' }));
    store.saveAndClose('d1', onSaved);
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
      'server-1',
      expect.objectContaining({ title: 'Server Widget' }),
    );

    // Error on updateWidget
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValueOnce(
      throwError(() => new Error('Update failed')),
    );
    store.draftWidget.set({
      id: 'server-1',
      dashboard_id: 'd1',
      title: 'Server Widget',
      type: 'SQL',
      visualization: 'table',
      config: { query: 'SELECT 1' },
    });
    store.saveAndClose('d1', onSaved);
    errSpy.mockRestore();
  });

  it('cancels local drafts in memory without API delete, and deletes server drafts when applicable', () => {
    store.selectCustomType('SQL');
    store.initializeDraft('d1');
    store.cancelDraft();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).not.toHaveBeenCalled();
    expect(store.draftWidget()).toBeNull();

    store.draftWidget.set({
      id: 'server-99',
      dashboard_id: 'd1',
      title: 'Persisted Draft',
      type: 'SQL',
      visualization: 'table',
      config: { query: 'SELECT 1' },
    });
    store.cancelDraft();
    expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).toHaveBeenCalledWith(
      'server-99',
    );
  });
});
