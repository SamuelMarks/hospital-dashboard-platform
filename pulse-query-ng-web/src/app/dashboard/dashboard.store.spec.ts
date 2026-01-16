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
  }; 
  let mockRouter: { navigate: ReturnType<typeof vi.fn> }; 

  const d1 = { id: 'd1', name: 'Test', widgets: [], owner_id: 'u1' } as DashboardResponse; 

  beforeEach(() => { 
    vi.useFakeTimers(); 

    mockDashApi = { 
      getDashboardApiV1DashboardsDashboardIdGet: vi.fn(), 
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(), 
      restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: vi.fn() 
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

  describe('Restore Defaults', () => { 
    it('should call restore API and navigate on success', () => { 
      const newDash = { id: 'd_restored', name: 'Command Center', widgets: [] }; 
      mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(of(newDash)); 

      store.createDefaultDashboard(); 

      expect(mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost).toHaveBeenCalled(); 
      // Verify navigation occurs
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard', 'd_restored']); 
    }); 

    it('should handle restore API failure', () => { 
      const error = new HttpErrorResponse({ status: 500, statusText: 'Server Error' }); 
      mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(throwError(() => error)); 

      store.createDefaultDashboard(); 

      expect(store.isLoading()).toBe(false); 
      expect(store.error()).toBe('Http failure response for (unknown url): 500 Server Error'); 
    }); 
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
      
      mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockImplementation( 
          () => of({ dept: 'A' }).pipe(delay(100)) 
      ); 
      
      store.updateGlobalParam('dept', 'A'); 
      vi.advanceTimersByTime(50); 
      
      store.updateGlobalParam('dept', 'B'); 
      vi.advanceTimersByTime(100); 

      // Should be called 3 times total (Initial + 2 updates), but the first update is cancelled in effect
      expect(mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost).toHaveBeenCalledTimes(3); 
    }); 
  }); 
});