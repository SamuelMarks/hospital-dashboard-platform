import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DashboardStore } from './dashboard.store';
import { DashboardsService, ExecutionService, DashboardResponse, WidgetResponse } from '../api-client';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';

describe('DashboardStore', () => {
  let store: DashboardStore;
  let mockExecApi: { refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn> };
  let mockDashApi: {
    getDashboardApiV1DashboardsDashboardIdGet: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
  };

  const d1 = { id: 'd1', name: 'Test', widgets: [], owner_id: 'u1' } as DashboardResponse;

  beforeEach(() => {
    vi.useFakeTimers();

    mockDashApi = {
      getDashboardApiV1DashboardsDashboardIdGet: vi.fn(),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn()
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn(),
    };

    // FIX: Provide default return value to prevent "undefined reading pipe" crashes
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({})); 

    TestBed.configureTestingModule({
      providers: [
        DashboardStore,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi }
      ]
    });

    store = TestBed.inject(DashboardStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Loading & Refresh Pipeline', () => {
    it('should load dashboard and trigger refresh pipeline', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({ w1: [1, 2] }));

      store.loadDashboard('d1');

      expect(store.isLoading()).toBe(false);
      expect(store.dashboard()).toEqual(d1);
      expect(store.dataMap()).toEqual({ w1: [1, 2] });
    });

    it('should handle race conditions via switchMap', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      store.loadDashboard('d1');
      
      // FIX: Use permanent return value factory to ensure ALL 3 calls get an observable
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockImplementation(() => of({ dept: 'A' }).pipe(delay(100)));
      
      store.updateGlobalParam('dept', 'A');
      vi.advanceTimersByTime(50); // Advance halfway
      
      store.updateGlobalParam('dept', 'B'); // Should cancel A
      vi.advanceTimersByTime(100); // Advance to completion of B

      // Ensure pipeline was subscribed 3 times (1 initial + 2 updates)
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(3); 
    });

    it('should handle refresh errors gracefully', () => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      // First call (loadDashboard) succeeds with default mock
      
      store.loadDashboard('d1');

      const err = new HttpErrorResponse({ error: { detail: 'Exec Failed' }, status: 500 });
      // Next call fails
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(throwError(() => err));

      store.refreshAll();

      expect(store.isLoading()).toBe(false);
      expect(store.error()).toBe('Exec Failed');
    });
  });

  // ... rest of tests (unchanged)
  describe('Parameter Management', () => {
    beforeEach(() => {
      mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(d1));
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({}));
      store.loadDashboard('d1');
    });

    it('should set global param and trigger refresh', () => {
      store.updateGlobalParam('dept', 'Cardiology');
      
      expect(store.globalParams()).toEqual({ dept: 'Cardiology' });
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledWith('d1', { dept: 'Cardiology' });
    });

    it('should remove param if value is null', () => {
      store.updateGlobalParam('dept', 'Cardiology');
      store.updateGlobalParam('dept', null);

      expect(store.globalParams()).toEqual({});
    });
  });

  describe('Widget Operations', () => {
    it('should optimistically remove widget', () => {
      const w1 = { id: 'w1' } as unknown as WidgetResponse;
      store['patch']({ widgets: [w1] }); 

      store.optimisticRemoveWidget('w1');
      expect(store.widgets().length).toBe(0);
    });

    it('should update widget group on drop', () => {
      const w1 = { id: 'w1', config: { group: 'A' } } as unknown as WidgetResponse;
      store['patch']({ dashboard: d1, widgets: [w1] });
      
      mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

      store.handleWidgetDrop(false, 'B', 0, 0, [w1], []);

      const updated = store.widgets()[0];
      expect(updated.config['group']).toBe('B');
      expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalled();
    });
  });
});