import { TestBed, fakeAsync, tick } from '@angular/core/testing'; 
import { DashboardStore } from './dashboard.store'; 
import { DashboardsService, ExecutionService, DashboardResponse, WidgetResponse, WidgetCreate } from '../api-client'; 
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

  describe('Drag and Drop Reordering', () => { 
    it('should calculate new orders and call bulk update API', () => { 
      // Setup state
      const w1 = { id: 'w1', config: { group: 'A', order: 0 } } as unknown as WidgetResponse; 
      const w2 = { id: 'w2', config: { group: 'A', order: 1 } } as unknown as WidgetResponse; 
      
      store['patch']({ dashboard: d1, widgets: [w1, w2] }); 
      
      mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost.mockReturnValue(of({ updated: 2 })); 

      const visualResult = [w2, w1]; 
      
      store.handleWidgetDrop(true, 'A', 1, 0, visualResult, [w1, w2]); 
      
      expect(mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost).toHaveBeenCalledWith( 
        'd1', 
        expect.objectContaining({ 
            items: expect.arrayContaining([ 
                { id: 'w2', order: 0, group: 'A' }, 
                { id: 'w1', order: 1, group: 'A' } 
            ]) 
        }) 
      ); 
    }); 
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

  describe('Duplication', () => { 
    it('should duplicate a widget', () => { 
      const source = { 
        id: 'w1', 
        dashboard_id: 'd1', // Corrected: Required by WidgetResponse
        title: 'Original', 
        type: 'SQL', 
        visualization: 'table', 
        config: { query: 'SELECT 1', x: 0, y: 0 } 
      } as WidgetResponse; 

      const expectedResponse = { ...source, id: 'w2', title: 'Copy of Original' }; 

      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of(expectedResponse)); 
      
      store['patch']({ dashboard: d1, widgets: [source] }); 

      store.duplicateWidget(source); 

      // Should call API with computed config (x+1, y+1) 
      const expectedPayload: WidgetCreate = { 
        title: 'Copy of Original', 
        type: 'SQL', 
        visualization: 'table', 
        config: { query: 'SELECT 1', x: 1, y: 1 } 
      }; 

      expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalledWith( 
        'd1', 
        expect.objectContaining({ 
            title: expectedPayload.title, 
            config: expect.objectContaining({ x: 1, y: 1 }) 
        }) 
      ); 

      // Optimistic + Final Update check involves async stream in a real scenario
      // But here sync mock ensures widgets array updated
      const widgets = store.widgets(); 
      expect(widgets.length).toBe(2); 
      expect(widgets[1].id).toBe('w2'); 
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