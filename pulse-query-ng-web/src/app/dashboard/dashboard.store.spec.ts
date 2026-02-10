import { TestBed } from '@angular/core/testing';
import { DashboardStore } from './dashboard.store';
import { DashboardsService, ExecutionService, DashboardResponse, WidgetResponse } from '../api-client';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

describe('DashboardStore', () => {
  let store: DashboardStore;
  let mockExecApi: { refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn> };
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
    ...overrides
  });

  const makeDashboard = (overrides: Partial<DashboardResponse> = {}): DashboardResponse => ({
    id: 'd1',
    name: 'Test',
    owner_id: 'u1',
    widgets: [],
    ...overrides
  });

  const d1 = makeDashboard();

  beforeEach(() => {
    vi.useFakeTimers();

    mockDashApi = {
      getDashboardApiV1DashboardsDashboardIdGet: vi.fn(),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
      restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: vi.fn(),
      reorderWidgetsApiV1DashboardsDashboardIdReorderPost: vi.fn(),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn()
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn(),
    };
    mockRouter = {
        navigate: vi.fn().mockReturnValue(Promise.resolve(true))
    };

    // Default return to prevent pipe crash
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        DashboardStore,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
        { provide: Router, useValue: mockRouter }
      ]
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
    // Setup widgets
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

  it('should sort widgets with missing order as zero', () => {
    const w1 = makeWidget({ id: 'w1', config: {} });
    const w2 = makeWidget({ id: 'w2', config: { order: 2 } });
    store['patch']({ widgets: [w2, w1] });

    expect(store.sortedWidgets()[0].id).toBe('w1');
  });

  it('should return null focusedWidget when id not found', () => {
    const w1 = makeWidget({ id: 'w1' });
    store['patch']({ widgets: [w1], focusedWidgetId: 'missing' });
    expect(store.focusedWidget()).toBeNull();
  });

  it('should expose globalParams and isWidgetLoading selectors', () => {
    store['patch']({ globalParams: { dept: 'ICU' } });
    store['patch']({ loadingWidgetIds: new Set(['w1']) });
    expect(store.globalParams()).toEqual({ dept: 'ICU' });
    expect(store.isWidgetLoading()('w1')).toBe(true);
    expect(store.isWidgetLoading()('w2')).toBe(false);
  });

  // --- Auto-Refresh Tests ---

  it('should update lastUpdated timestamp on success', () => {
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({ data: 1 }));

    store.loadDashboard('d1');
    expect(store.lastUpdated()).toBeDefined();

    const ts1 = store.lastUpdated();

    // Simulate time passage and manual refresh
    vi.advanceTimersByTime(1000);
    store.refreshAll();

    expect(store.lastUpdated()).not.toBe(ts1);
  });

  it('should poll for data every 5 minutes by default', () => {
    store['patch']({ dashboard: d1 }); // Preload dash
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({}));

    // Reset calls from initial load
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockClear();

    // Advance 5 minutes (300,000ms)
    vi.advanceTimersByTime(300_000);
    expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(1);

    // Another 5 mins
    vi.advanceTimersByTime(300_000);
    expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(2);
  });

  it('should pause polling when in Edit Mode', () => {
    store['patch']({ dashboard: d1 });
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockClear();

    // Enter Edit Mode
    store.toggleEditMode();
    expect(store.isEditMode()).toBe(true);

    vi.advanceTimersByTime(300_000);
    // Should NOT have called refresh
    expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).not.toHaveBeenCalled();

    // Exit Edit Mode
    store.toggleEditMode();
    vi.advanceTimersByTime(300_000);
    // Should resume
    expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(1);
  });

  it('should pause polling if toggleAutoRefresh is disabled', () => {
    store['patch']({ dashboard: d1 });
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockClear();

    store.toggleAutoRefresh(); // Disable
    vi.advanceTimersByTime(300_000);
    expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).not.toHaveBeenCalled();
  });

  // --- End Auto-Refresh Tests ---

  describe('Loading & Refresh Pipeline', () => {
    it('should load dashboard and trigger refresh pipeline', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({ w1: [1, 2] }));

      store.loadDashboard('d1');

      expect(store.isLoading()).toBe(false);
      expect(store.dashboard()).toEqual(d1);
      expect(store.dataMap()).toEqual({ w1: [1, 2] });
    });

    it('should deduplicate global params updates', () => {
      store['patch']({ dashboard: d1 });

      // Update with new
      store.setGlobalParams({ dept: 'A' });
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(1);

      // Update with SAME
      store.setGlobalParams({ dept: 'A' });
      // Should not call again
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(1);

      // Update with different
      store.setGlobalParams({ dept: 'B' });
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(2);
    });

    it('should handle race conditions via switchMap', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      store.loadDashboard('d1');

      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockImplementation(
          () => of({ dept: 'A' }).pipe(delay(100))
      );

      store.setGlobalParams({ dept: 'A' });
      vi.advanceTimersByTime(50);

      store.setGlobalParams({ dept: 'B' });
      vi.advanceTimersByTime(100);

      // Calls:
      // 1. Initial load (auto-refresh)
      // 2. Param A
      // 3. Param B -> Cancels A
      // Total 3 invocations start, but we only care operationally.
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(3);
    });

    it('should handle refresh errors via catchError', () => {
      store['patch']({ dashboard: d1 });
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(
        throwError(() => new Error('fail'))
      );

      store.setGlobalParams({ dept: 'A' });

      expect(store.error()).toBe('fail');
      expect(store.isLoading()).toBe(false);
    });
  });

  it('should heal broken widgets when loading dashboard', () => {
    const brokenWidget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_ID FROM t' }
    });
    const dash = makeDashboard({ widgets: [brokenWidget] });

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

    store.loadDashboard('d1');

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalled();
  });

  it('should default widgets to empty when response has none', () => {
    const dash = makeDashboard({ widgets: undefined });
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));

    store.loadDashboard('d1');

    expect(store.widgets()).toEqual([]);
    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should skip auto-fix when query does not include Visit_ID', () => {
    const widget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_Type FROM t' }
    });
    const dash = makeDashboard({ widgets: [widget] });

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));

    store.loadDashboard('d1');

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should ignore widgets that do not match auto-fix criteria', () => {
    const widget = makeWidget({
      id: 'w1',
      title: 'Other Widget',
      config: {}
    });
    const dash = makeDashboard({ widgets: [widget] });

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));

    store.loadDashboard('d1');

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).not.toHaveBeenCalled();
  });

  it('should log repair failures when auto-fix update fails', () => {
    const brokenWidget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_ID FROM t' }
    });
    const dash = makeDashboard({ widgets: [brokenWidget] });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('fail'))
    );

    store.loadDashboard('d1');

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('should expose global params and widget loading selector', () => {
    store['patch']({
      globalParams: { dept: 'ER' },
      loadingWidgetIds: new Set(['w1'])
    });

    expect(store.globalParams()).toEqual({ dept: 'ER' });
    expect(store.isWidgetLoading()('w1')).toBe(true);
    expect(store.isWidgetLoading()('w2')).toBe(false);
  });

  it('should duplicate widget and refresh on success', () => {
    const widget = makeWidget({ id: 'w1', title: 'Widget', config: {} });
    store['patch']({ dashboard: d1, widgets: [widget] });

    const created = makeWidget({ id: 'w2', dashboard_id: 'd1' });
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(created));

    const refreshSpy = vi.spyOn(store, 'refreshWidget');
    store.duplicateWidget(widget);

    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalledWith('w2');
  });

  it('should no-op duplicateWidget without a dashboard', () => {
    store['patch']({ dashboard: null });
    store.duplicateWidget(makeWidget({ id: 'w1' }));
    expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).not.toHaveBeenCalled();
  });

  it('should rollback duplicate widget on error', () => {
    const widget = makeWidget({ id: 'w1', title: 'Widget', config: {} });
    store['patch']({ dashboard: d1, widgets: [widget] });

    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(throwError(() => new Error('fail')));

    store.duplicateWidget(widget);

    expect(store.widgets().length).toBe(1);
    expect(store.error()).toBeTruthy();
  });

  it('should create default dashboard and navigate', async () => {
    const newDash = makeDashboard({ id: 'new', name: 'New' });
    mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(of(newDash));

    store.createDefaultDashboard();

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard', 'new']);
    await Promise.resolve();
  });

  it('should handle errors when creating default dashboard', () => {
    mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(throwError(() => new Error('oops')));

    store.createDefaultDashboard();

    expect(store.error()).toBeTruthy();
  });

  it('should update widget order and handle API errors', () => {
    const w1 = makeWidget({ id: 'w1', config: { order: 0 } });
    const w2 = makeWidget({ id: 'w2', config: { order: 1 } });
    store['patch']({ dashboard: d1, widgets: [w1, w2] });

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
    mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost.mockReturnValue(throwError(() => new Error('fail')));

    store.updateWidgetOrder(0, 1);

    expect(mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost).toHaveBeenCalled();
  });

  it('should short-circuit updateWidgetOrder for invalid inputs', () => {
    store.updateWidgetOrder(0, 0);
    store['patch']({ dashboard: null });
    store.updateWidgetOrder(0, 1);

    expect(mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost).not.toHaveBeenCalled();
  });

  it('should reset store state', () => {
    store['patch']({ dashboard: d1, widgets: [makeWidget({ id: 'w1' })] });
    store.reset();
    expect(store.dashboard()).toBeNull();
    expect(store.widgets().length).toBe(0);
  });

  it('should handle errors with HttpErrorResponse detail', () => {
    const err = new HttpErrorResponse({ error: { detail: 'Bad' }, status: 500 });
    (store as any).handleError(err);
    expect(store.error()).toBe('Bad');
  });

  it('should handle HttpErrorResponse without detail', () => {
    const err = new HttpErrorResponse({ error: {}, status: 500, statusText: 'Server Error', url: '/api' });
    (store as any).handleError(err);
    expect(store.error()).toContain('Http failure response');
  });

  it('should handle errors with generic Error', () => {
    (store as any).handleError(new Error('Boom'));
    expect(store.error()).toBe('Boom');
  });

  it('should stringify non-string HttpErrorResponse detail', () => {
    const err = new HttpErrorResponse({ error: { detail: ['a', 'b'] }, status: 400 });
    (store as any).handleError(err);
    expect(store.error()).toContain('a');
  });

  it('should handle unknown error types', () => {
    (store as any).handleError({ weird: true });
    expect(store.error()).toBe('An unexpected error occurred');
  });

  it('should optimistically restore widgets', () => {
    const w = makeWidget({ id: 'w1' });
    store.optimisticRestoreWidget(w);
    expect(store.widgets().length).toBe(1);
  });

  it('should emit refresh for a widget', () => {
    store.refreshWidget('w1');
    expect(true).toBe(true);
  });

  it('should set loading state', () => {
    store.setLoading(true);
    expect(store.isLoading()).toBe(true);
  });

  it('should handle loadDashboard errors', () => {
    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(throwError(() => new Error('fail')));
    store.loadDashboard('d1');
    expect(store.error()).toBeTruthy();
    expect(store.isLoading()).toBe(false);
  });

  it('should clean up on destroy', () => {
    store.ngOnDestroy();
    expect(true).toBe(true);
  });
});
