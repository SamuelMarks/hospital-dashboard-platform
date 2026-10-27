/**
 * @fileoverview Unit tests for DashboardStore.
 */

import { TestBed } from '@angular/core/testing';
import { DashboardStore } from './dashboard.store';
import { DashboardOfflineCacheService } from './dashboard-offline-cache.service';
import {
  DashboardsService,
  ExecutionService,
  DashboardResponse,
  WidgetResponse,
} from '../api-client';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { vi } from 'vitest';

describe('DashboardStore', () => {
  let store: DashboardStore;
  let mockExecApi: {
    refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn>;
    refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost: ReturnType<typeof vi.fn>;
  };
  let mockDashApi: {
    getDashboardApiV1DashboardsDashboardIdGet: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
    deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: ReturnType<typeof vi.fn>;
    restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: ReturnType<typeof vi.fn>;
    reorderWidgetsApiV1DashboardsDashboardIdReorderPost: ReturnType<typeof vi.fn>;
    createWidgetApiV1DashboardsDashboardIdWidgetsPost: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  const makeWidget = (overrides: Partial<WidgetResponse> = {}): WidgetResponse => ({
    id: 'w1',
    dashboard_id: 'd1',
    title: 'Widget',
    type: 'SQL',
    visualization: 'table',
    config: {},
    ...overrides,
  });

  const makeDashboard = (overrides: Partial<DashboardResponse> = {}): DashboardResponse => ({
    id: 'd1',
    name: 'Test',
    owner_id: 'u1',
    widgets: [],
    ...overrides,
  });

  const d1 = makeDashboard();

  beforeEach(() => {
    vi.useFakeTimers();

    mockDashApi = {
      getDashboardApiV1DashboardsDashboardIdGet: vi.fn(),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn(),
      restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: vi.fn(),
      reorderWidgetsApiV1DashboardsDashboardIdReorderPost: vi.fn(),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn(),
      refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost: vi.fn(),
    };
    mockRouter = {
      navigate: vi.fn().mockReturnValue(Promise.resolve(true)),
    };

    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({}));
    mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.mockReturnValue(
      of({}),
    );

    TestBed.configureTestingModule({
      providers: [
        DashboardStore,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
        { provide: Router, useValue: mockRouter },
      ],
    });

    store = TestBed.inject(DashboardStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with edit mode disabled', () => {
    expect(store.isEditMode()).toBe(false);
  });

  it('should toggle edit mode', () => {
    store.toggleEditMode();
    expect(store.isEditMode()).toBe(true);
    store.toggleEditMode();
    expect(store.isEditMode()).toBe(false);
  });

  it('should set focus widget', () => {
    const w1 = makeWidget({ id: 'w1' });
    store.patch({ widgets: [w1] });

    expect(store.focusedWidgetId()).toBeNull();
    expect(store.focusedWidget()).toBeNull();

    store.setFocusedWidget('w1');

    expect(store.focusedWidgetId()).toBe('w1');
    expect(store.focusedWidget()).toEqual(w1);

    store.setFocusedWidget(null);
    expect(store.focusedWidgetId()).toBeNull();
  });

  describe('Loading & Refresh Pipeline', () => {
    it('should load dashboard and trigger refresh pipeline', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        of({ w1: [1, 2] }),
      );

      store.loadDashboard('d1');

      expect(store.isLoading()).toBe(false);
      expect(store.dashboard()).toEqual(d1);
      expect(store.dataMap()).toEqual({ w1: [1, 2] });

      store.patch({ dashboard: d1 });
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockImplementationOnce(
        () => {
          store.patch({ dashboard: null });
          return of({ w1: [3, 4] });
        },
      );
      store.refreshAll();
      expect(store.isLoading()).toBe(false);
    });

    it('should handle API errors securely mapping HttpErrorResponse details and restore offline snapshot if cached', () => {
      const offlineCache = TestBed.inject(DashboardOfflineCacheService);
      offlineCache.clearSnapshot('d1');

      const err = new HttpErrorResponse({ error: { detail: 'API Fail' }, status: 500 });
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(throwError(() => err));

      store.loadDashboard('d1');
      expect(store.error()).toBe('API Fail');
      expect(store.dashboard()).toBeNull();

      offlineCache.saveSnapshot(d1, { w1: { data: [] } });
      store.loadDashboard('d1');
      expect(store.dashboard()).toEqual(d1);
      expect(store.dataMap()).toEqual({ w1: { data: [] } });

      const dNoWidgets: DashboardResponse = { ...d1, id: 'd-empty' };
      Reflect.deleteProperty(dNoWidgets, 'widgets');
      offlineCache.saveSnapshot(dNoWidgets, {});
      store.loadDashboard('d-empty');
      expect(store.widgets()).toEqual([]);
      offlineCache.clearSnapshot('d1');
      offlineCache.clearSnapshot('d-empty');
    });

    it('should deduplicate global params updates', () => {
      store.patch({ dashboard: d1 });

      store.setGlobalParams({ dept: 'A' });
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).toHaveBeenCalledTimes(1);

      store.setGlobalParams({ dept: 'A' });
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).toHaveBeenCalledTimes(1);

      store.setGlobalParams({ dept: 'B' });
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('Restore Defaults', () => {
    it('should call restore API and navigate on success', () => {
      const newDash = { id: 'd_restored', name: 'Command Center', widgets: [] };
      mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(
        of(newDash),
      );

      store.createDefaultDashboard();

      expect(
        mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost,
      ).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard', 'd_restored']);
    });

    it('should handle restore API failure', () => {
      const error = new HttpErrorResponse({ status: 500, statusText: 'Server Error' });
      mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(
        throwError(() => error),
      );

      store.createDefaultDashboard();

      expect(store.isLoading()).toBe(false);
      expect(store.error()).toContain('Http failure response for (unknown url): 500 Server Error');
    });
  });

  describe('Duplication', () => {
    it('should duplicate a widget', () => {
      const source: WidgetResponse = {
        id: 'w1',
        dashboard_id: 'd1',
        title: 'Original',
        type: 'SQL',
        visualization: 'table',
        config: { query: 'SELECT 1', x: 0, y: 0 },
      };

      const expectedResponse = { ...source, id: 'w2', title: 'Copy of Original' };
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of(expectedResponse),
      );

      store.patch({ dashboard: d1, widgets: [source] });

      store.duplicateWidget(source);
      const widgets = store.widgets();
      expect(widgets.length).toBe(2);
      expect(widgets[1]?.id).toBe('w2');
    });

    it('should duplicate HTTP widget with type HTTP', () => {
      const source: WidgetResponse = {
        id: 'w-http',
        dashboard_id: 'd1',
        title: 'Original HTTP',
        type: 'HTTP',
        visualization: 'table',
        config: { url: 'https://api.test/data', method: 'GET' },
      };

      const expectedResponse = { ...source, id: 'w-http-copy', title: 'Copy of Original HTTP' };
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of(expectedResponse),
      );

      store.patch({ dashboard: d1, widgets: [source] });
      store.duplicateWidget(source);

      expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({
          type: 'HTTP',
          title: 'Copy of Original HTTP',
        }),
      );
    });

    it('should duplicate TEXT widget with type TEXT', () => {
      const source: WidgetResponse = {
        id: 'w-text',
        dashboard_id: 'd1',
        title: 'Original TEXT',
        type: 'TEXT',
        visualization: 'markdown',
        config: { content: '# Hospital Notes' },
      };

      const expectedResponse = { ...source, id: 'w-text-copy', title: 'Copy of Original TEXT' };
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of(expectedResponse),
      );

      store.patch({ dashboard: d1, widgets: [source] });
      store.duplicateWidget(source);

      expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({
          type: 'TEXT',
          title: 'Copy of Original TEXT',
          visualization: 'markdown',
        }),
      );
    });

    it('should handle duplication api errors', () => {
      const source: WidgetResponse = {
        id: 'w1',
        dashboard_id: 'd1',
        title: 'Original',
        type: 'SQL',
        visualization: 'table',
        config: { query: 'SELECT 1', x: 0, y: 0 },
      };
      store.patch({ dashboard: d1, widgets: [source] });

      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        throwError(() => new Error('Duplication Error')),
      );
      store.duplicateWidget(source);

      expect(store.error()).toBe('Duplication Error');
      expect(store.widgets().length).toBe(1);
    });
  });

  describe('updateWidgetLayout & deleteWidget', () => {
    it('should optimistically update widget layout and apply server response', () => {
      const w1 = makeWidget({ id: 'w1', config: { w: 6, h: 2 } });
      const w2 = makeWidget({ id: 'w2', config: {} });
      store.patch({ dashboard: d1, widgets: [w1, w2] });

      const updatedServerWidget = makeWidget({ id: 'w1', config: { w: 8, h: 2 } });
      mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
        of(updatedServerWidget),
      );

      store.updateWidgetLayout('w1', { w: 8 });
      expect(store.widgets()[0]?.config['w']).toBe(8);
      expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith('w1', {
        config: { w: 8, h: 2 },
      });

      // Also test when server returns empty object
      mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));
      store.updateWidgetLayout('w2', { w: 4 });
      expect(store.widgets()[1]?.config['w']).toBe(4);

      // Unknown widget ID should no-op
      store.updateWidgetLayout('missing-id', { w: 12 });
      expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledTimes(2);
    });

    it('should roll back widget layout on API error', () => {
      const w1 = makeWidget({ id: 'w1', config: { w: 6, h: 2 } });
      store.patch({ dashboard: d1, widgets: [w1] });
      mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
        throwError(() => new Error('Layout save failed')),
      );

      store.updateWidgetLayout('w1', { w: 10 });
      expect(store.widgets()[0]?.config['w']).toBe(6);
      expect(store.error()).toBe('Layout save failed');
    });

    it('should optimistically delete widget and roll back on API error', () => {
      const w1 = makeWidget({ id: 'w1' });
      store.patch({ dashboard: d1, widgets: [w1] });

      // Missing widget ID should no-op
      store.deleteWidget('missing');
      expect(mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete).not.toHaveBeenCalled();

      // Successful delete keeps widget removed
      mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(of({}));
      store.deleteWidget('w1');
      expect(store.widgets()).toEqual([]);

      // Failing delete rolls back the removed widget
      store.patch({ widgets: [w1] });
      mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(
        throwError(() => new Error('Delete failed')),
      );
      store.deleteWidget('w1');
      expect(store.widgets()).toEqual([w1]);
      expect(store.error()).toBe('Delete failed');
    });
  });

  describe('Auto-Refresh', () => {
    it('should update lastUpdated timestamp on success', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        of({ data: 1 }),
      );

      store.loadDashboard('d1');
      expect(store.lastUpdated()).toBeDefined();

      const ts1 = store.lastUpdated();
      vi.advanceTimersByTime(1000);
      store.refreshAll();

      expect(store.lastUpdated()).not.toBe(ts1);
    });

    it('should pause polling if toggleAutoRefresh is disabled', () => {
      store.patch({ dashboard: d1 });
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockClear();

      store.toggleAutoRefresh();
      vi.advanceTimersByTime(300_000);
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).not.toHaveBeenCalled();
    });

    it('startPolling triggers refreshTrigger', () => {
      store.patch({ dashboard: d1 });
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockClear();
      store.startPolling();
      vi.advanceTimersByTime(300_000);
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalled();
    });
  });

  describe('Widget Updates & Optimistic Data', () => {
    it('should optimistically remove widget', () => {
      const w1 = makeWidget({ id: 'w1' });
      store.patch({ widgets: [w1] });
      store.optimisticRemoveWidget('w1');
      expect(store.widgets().length).toBe(0);
    });

    it('should optimistically restore widget', () => {
      const w1 = makeWidget({ id: 'w1' });
      store.optimisticRestoreWidget(w1);
      expect(store.widgets().length).toBe(1);
    });

    it('should refresh a single widget with dedicated endpoint', () => {
      mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.mockReturnValue(
        of({ w2: [9, 9] }),
      );
      store.patch({ dashboard: d1 });
      store.refreshWidget('w2', true);

      expect(
        mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost,
      ).toHaveBeenCalledWith('d1', 'w2', true);
      expect(store.dataMap()).toEqual({ w2: [9, 9] });

      mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.mockReturnValue(
        of({ w3: [1, 2, 3] }),
      );
      store.refreshWidget('w3');
      expect(store.dataMap()['w3']).toEqual([1, 2, 3]);

      mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.mockReturnValue(
        of(null),
      );
      store.refreshWidget('w3');
      expect(store.dataMap()['w3']).toEqual([1, 2, 3]);

      // Refresh with naturalText and processor options
      mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.mockReturnValue(
        of({
          w3: { data: [{ c: 1 }], generated_sql: 'SELECT 1 AS c', processor_used: 'ollama:llama3' },
        }),
      );
      store.refreshWidget('w3', true, { naturalText: 'Count rows', processor: 'ollama:llama3' });
      expect(
        mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost,
      ).toHaveBeenCalledWith(
        'd1',
        'w3',
        true,
        undefined,
        undefined,
        undefined,
        'body',
        false,
        expect.objectContaining({
          naturalText: 'Count rows',
          processor: 'ollama:llama3',
        }),
      );
      store.refreshWidget('w3', true, { processor: 'SQL' });
      store.refreshWidget('w3', true, { naturalText: 'SELECT 1' });
    });

    it('should handle refreshWidget error gracefully', () => {
      mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost.mockReturnValue(
        throwError(() => new Error('Refresh error')),
      );
      store.patch({ dashboard: d1 });
      store.refreshWidget('w2');

      expect(store.error()).toBe('Refresh error');
    });

    it('should early return from refreshWidget if no dashboard or no widgetId', () => {
      store.patch({ dashboard: null });
      store.refreshWidget('w2');
      expect(
        mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost,
      ).not.toHaveBeenCalled();

      store.patch({ dashboard: d1 });
      store.refreshWidget('');
      expect(
        mockExecApi.refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost,
      ).not.toHaveBeenCalled();
    });

    it('should set full widget list via setWidgets', () => {
      const w = [makeWidget({ id: 'w99' })];
      store.setWidgets(w);
      expect(store.widgets()).toEqual(w);
    });
  });

  describe('updateWidgetOrder', () => {
    it('should early return if same index, out-of-bounds index, or no dashboard', () => {
      store.updateWidgetOrder(0, 0);
      expect(
        mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost,
      ).not.toHaveBeenCalled();

      store.patch({ dashboard: d1, widgets: [] });
      store.updateWidgetOrder(5, 0);
      expect(
        mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost,
      ).not.toHaveBeenCalled();
    });

    it('should update order optimistically and call reorder API', () => {
      const w1 = makeWidget({ id: 'w1', config: { group: 'A', order: 0 } });
      const w2 = makeWidget({ id: 'w2', config: { group: 'A', order: 1 } });
      store.patch({ dashboard: d1, widgets: [w1, w2] });

      mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost.mockReturnValue(of({}));

      store.updateWidgetOrder(1, 0);

      expect(store.widgets()[0]?.id).toBe('w2');
      expect(store.widgets()[1]?.id).toBe('w1');
      expect(store.widgets()[0]?.config['order']).toBe(0);
      expect(store.widgets()[1]?.config['order']).toBe(1);

      expect(mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost).toHaveBeenCalledWith(
        'd1',
        {
          items: [
            { id: 'w2', order: 0, group: 'General' },
            { id: 'w1', order: 1, group: 'General' },
          ],
        },
      );
    });

    it('should handle reorder error and reload dashboard', () => {
      const w1 = makeWidget({ id: 'w1', config: { group: 'A', order: 0 } });
      const w2 = makeWidget({ id: 'w2', config: { group: 'A', order: 1 } });
      store.patch({ dashboard: d1, widgets: [w1, w2] });

      mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost.mockReturnValue(
        throwError(() => new Error('Reorder err')),
      );
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));

      store.updateWidgetOrder(1, 0);

      expect(mockDashApi.getDashboardApiV1DashboardsDashboardIdGet).toHaveBeenCalledWith('d1');
    });
  });

  describe('HandleError Details', () => {
    it('should handle non-string details from API', () => {
      const err = new HttpErrorResponse({ error: { detail: { nested: 'info' } }, status: 500 });
      store.handleError(err);
      expect(store.error()).toBe('{"nested":"info"}');
    });

    it('should handle generic error', () => {
      store.handleError(new Error('Generic failure'));
      expect(store.error()).toBe('Generic failure');
    });
  });

  it('should reset store state', () => {
    store.patch({ dashboard: d1 });
    store.reset();
    expect(store.dashboard()).toBeNull();
    expect(store.widgets()).toEqual([]);
  });

  describe('Edge cases and missing branches', () => {
    it('handleError with non-Error object', () => {
      store.handleError('Just a string error');
      expect(store.error()).toBe('An unexpected error occurred');
    });

    it('focusedWidget returns null if widget is not found', () => {
      const w1 = makeWidget({ id: 'w1' });
      store.patch({ widgets: [w1] });
      store.setFocusedWidget('non-existent');
      expect(store.focusedWidget()).toBeNull();
    });

    it('loadDashboard handles undefined widgets safely', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(
        of({ ...d1, widgets: undefined }),
      );
      store.loadDashboard('d1');
      expect(store.widgets()).toEqual([]);
    });

    it('duplicateWidget returns early if dashboard is null', () => {
      store.patch({ dashboard: null });
      store.duplicateWidget(makeWidget());
      expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
    });

    it('duplicateWidget with valid x and y in config', () => {
      const source = makeWidget({
        id: 'w1',
        title: 'Original',
        config: { query: 'SELECT 1', x: 2, y: 3 },
      });
      store.patch({ dashboard: d1, widgets: [source] });
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of({ ...source, id: 'w2' }),
      );

      store.duplicateWidget(source);

      expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith(
        'd1',
        expect.objectContaining({
          config: expect.objectContaining({ x: 3, y: 4 }) as unknown,
        }),
      );
    });

    it('sortedWidgets handles widgets with explicit order vs no order', () => {
      const w1 = makeWidget({ id: 'w1', config: {} });
      const w2 = makeWidget({ id: 'w2', config: { order: -1 } });
      const w3 = makeWidget({ id: 'w3', config: { order: 2 } });
      const w4 = makeWidget({ id: 'w4', config: { order: 0 } });

      store.patch({ widgets: [w1, w2, w3, w4] });

      const sorted = store.sortedWidgets();
      expect(sorted.length).toBe(4);
    });

    it('reads isWidgetLoading and globalParams', () => {
      store.setGlobalParams({ test: 123 });
      expect(store.globalParams()).toEqual({ test: 123 });

      store.patch({ loadingWidgetIds: new Set(['w1']) });
      const isWidgetLoadingFn = store.isWidgetLoading();
      expect(isWidgetLoadingFn('w1')).toBe(true);
      expect(isWidgetLoadingFn('w2')).toBe(false);
    });

    it('refreshAll when dashboard is null', () => {
      store.patch({ dashboard: null });
      store.refreshAll();
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).not.toHaveBeenCalled();
    });

    it('refreshAll handles catchError and sets loading false', () => {
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        throwError(() => new Error('Simulated exec failure')),
      );
      store.patch({ dashboard: d1 });
      store.refreshAll();
      expect(store.error()).toBe('Simulated exec failure');
      expect(store.isLoading()).toBe(false);
    });

    it('ngOnDestroy stops polling and destroys', () => {
      store.patch({ dashboard: d1 });
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockClear();
      store.ngOnDestroy();
      vi.advanceTimersByTime(300_000);
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).not.toHaveBeenCalled();
    });

    it('setLoading directly patches loading state', () => {
      store.setLoading(true);
      expect(store.isLoading()).toBe(true);
      store.setLoading(false);
      expect(store.isLoading()).toBe(false);
    });
  });

  it('should not mutate or update widgets when loading dashboard', () => {
    const widget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_Type FROM t' },
    });
    const dash = makeDashboard({ widgets: [widget] });

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));

    store.loadDashboard('d1');

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });
});
