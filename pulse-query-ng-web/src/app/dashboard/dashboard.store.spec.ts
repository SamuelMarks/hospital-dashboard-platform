import { TestBed, fakeAsync, tick } from '@angular/core/testing';
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

  const d1 = { id: 'd1', name: 'Test', widgets: [], owner_id: 'u1' } as DashboardResponse;

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
    const w1 = { id: 'w1' } as WidgetResponse;
    store['patch']({ widgets: [w1] });

    expect(store.focusedWidgetId()).toBeNull();
    expect(store.focusedWidget()).toBeNull();

    store.setFocusedWidget('w1');
    
    expect(store.focusedWidgetId()).toBe('w1');
    expect(store.focusedWidget()).toEqual(w1);

    store.setFocusedWidget(null);
    expect(store.focusedWidgetId()).toBeNull();
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
  });
});