import { TestBed } from '@angular/core/testing';
import { DashboardStore } from './dashboard.store';
import {
  DashboardsService,
  ExecutionService,
  DashboardResponse,
  WidgetResponse,
} from '../api-client';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { vi } from 'vitest';

describe('DashboardStore', () => {
  let store: DashboardStore;
  let mockExecApi: {
    refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn>;
  };
  let mockDashApi: {
    getDashboardApiV1DashboardsDashboardIdGet: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
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
      restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: vi.fn(),
      reorderWidgetsApiV1DashboardsDashboardIdReorderPost: vi.fn(),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn(),
    };
    mockRouter = {
      navigate: vi.fn().mockReturnValue(Promise.resolve(true)),
    };

    // Default return to prevent pipe crash
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({}));

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
    store['patch']({ widgets: [w1] });

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
    });

    it('should handle API errors securely mapping HttpErrorResponse details', () => {
      const err = new HttpErrorResponse({ error: { detail: 'API Fail' }, status: 500 });
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(throwError(() => err));

      store.loadDashboard('d1');

      expect(store.error()).toBe('API Fail');
    });

    it('should deduplicate global params updates', () => {
      store['patch']({ dashboard: d1 });

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
      const source = {
        id: 'w1',
        dashboard_id: 'd1',
        title: 'Original',
        type: 'SQL',
        visualization: 'table',
        config: { query: 'SELECT 1', x: 0, y: 0 },
      } as WidgetResponse;

      const expectedResponse = { ...source, id: 'w2', title: 'Copy of Original' };
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of(expectedResponse),
      );

      store['patch']({ dashboard: d1, widgets: [source] });

      store.duplicateWidget(source);
      const widgets = store.widgets();
      expect(widgets.length).toBe(2);
      expect(widgets[1].id).toBe('w2');
    });

    it('should handle duplication api errors', () => {
      const source = {
        id: 'w1',
        dashboard_id: 'd1',
        title: 'Original',
        type: 'SQL',
        visualization: 'table',
        config: { query: 'SELECT 1', x: 0, y: 0 },
      } as WidgetResponse;
      store['patch']({ dashboard: d1, widgets: [source] });

      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        throwError(() => new Error('Duplication Error')),
      );
      store.duplicateWidget(source);

      expect(store.error()).toBe('Duplication Error');
      expect(store.widgets().length).toBe(1);
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
      store['patch']({ dashboard: d1 });
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockClear();

      store.toggleAutoRefresh(); // Disable
      vi.advanceTimersByTime(300_000);
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).not.toHaveBeenCalled();
    });
    it('startPolling triggers refreshTrigger', () => {
      const spy = vi.spyOn((store as any).refreshTrigger$, 'next');
      store['startPolling']();
      vi.advanceTimersByTime(300_000);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Widget Updates & Optimistic Data', () => {
    it('should optimistically remove widget', () => {
      const w1 = { id: 'w1' } as WidgetResponse;
      store['patch']({ widgets: [w1] });
      store.optimisticRemoveWidget('w1');
      expect(store.widgets().length).toBe(0);
    });

    it('should optimistically restore widget', () => {
      const w1 = { id: 'w1' } as WidgetResponse;
      store.optimisticRestoreWidget(w1);
      expect(store.widgets().length).toBe(1);
    });

    it('should refresh a single widget', () => {
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        of({ w2: [9, 9] }),
      );
      store['patch']({ dashboard: d1 });
      store.refreshWidget('w2');

      expect(store.dataMap()).toEqual({ w2: [9, 9] });
    });
  });

  describe('updateWidgetOrder', () => {
    it('should early return if same index or no dashboard', () => {
      store.updateWidgetOrder(0, 0);
      expect(
        mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost,
      ).not.toHaveBeenCalled();
    });

    it('should update order optimistically and call reorder API', () => {
      const w1 = makeWidget({ id: 'w1', config: { group: 'A', order: 0 } });
      const w2 = makeWidget({ id: 'w2', config: { group: 'A', order: 1 } });
      store['patch']({ dashboard: d1, widgets: [w1, w2] });

      mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost.mockReturnValue(of({}));

      store.updateWidgetOrder(1, 0); // Move w2 to top

      expect(store.widgets()[0].id).toBe('w2');
      expect(store.widgets()[1].id).toBe('w1');
      expect(store.widgets()[0].config['order']).toBe(0);
      expect(store.widgets()[1].config['order']).toBe(1);

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
      store['patch']({ dashboard: d1, widgets: [w1, w2] });

      mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost.mockReturnValue(
        throwError(() => new Error('Reorder err')),
      );
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1)); // Mock reload

      store.updateWidgetOrder(1, 0);

      expect(mockDashApi.getDashboardApiV1DashboardsDashboardIdGet).toHaveBeenCalledWith('d1');
    });
  });

  describe('HandleError Details', () => {
    it('should handle non-string details from API', () => {
      const err = new HttpErrorResponse({ error: { detail: { nested: 'info' } }, status: 500 });
      store['handleError'](err);
      expect(store.error()).toBe('{"nested":"info"}');
    });

    it('should handle generic error', () => {
      store['handleError'](new Error('Generic failure'));
      expect(store.error()).toBe('Generic failure');
    });
  });

  it('should reset store state', () => {
    store['patch']({ dashboard: d1 });
    store.reset();
    expect(store.dashboard()).toBeNull();
    expect(store.widgets()).toEqual([]);
  });

  describe('Edge cases and missing branches', () => {
    it('refreshAll when dashboard is null', () => {
      store['patch']({ dashboard: null });
      store.refreshAll();
      expect(
        mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost,
      ).not.toHaveBeenCalled();
    });

    it('refreshAll handles catchError and sets loading false', () => {
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        throwError(() => new Error('Simulated exec failure')),
      );
      store['patch']({ dashboard: d1 });
      store.refreshAll();
      expect(store.error()).toBe('Simulated exec failure');
      expect(store.isLoading()).toBe(false);
    });

    it('ngOnDestroy stops polling and destroys', () => {
      const unsubSpy = vi.spyOn((store as any).destroy$, 'next');
      store.ngOnDestroy();
      expect(unsubSpy).toHaveBeenCalled();
    });

    it('setLoading directly patches loading state', () => {
      store.setLoading(true);
      expect(store.isLoading()).toBe(true);
      store.setLoading(false);
      expect(store.isLoading()).toBe(false);
    });
  });

  it('should log repair failures when auto-fix update fails', () => {
    const brokenWidget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_ID FROM t' },
    });
    const dash = makeDashboard({ widgets: [brokenWidget] });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    store.loadDashboard('d1');

    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should heal broken widgets when loading dashboard', () => {
    const brokenWidget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_ID FROM t' },
    });
    const dash = makeDashboard({ widgets: [brokenWidget] });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

    store.loadDashboard('d1');

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // ... (rest of tests unchanged)
});
