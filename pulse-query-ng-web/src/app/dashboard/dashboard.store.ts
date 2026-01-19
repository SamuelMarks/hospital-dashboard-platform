/** 
 * @fileoverview Centralized State Management for the Dashboard Feature. 
 * 
 * Manages: 
 * - Dashboard Metadata & Widget Configuration. 
 * - Execution Data (Results of SQL/HTTP queries). 
 * - Layout State (Drag & Drop positioning). 
 * - Global Filtering Parameters (Synced with URL). 
 * - UI Mode (Edit vs Read-Only). 
 * - **Focus Mode**: Tracks which widget is currently maximized. 
 */ 

import { Injectable, signal, computed, inject, Signal } from '@angular/core'; 
import { Router } from '@angular/router'; 
import { HttpErrorResponse } from '@angular/common/http'; 
import { Subject, of } from 'rxjs'; 
import { switchMap, catchError, takeUntil, tap } from 'rxjs/operators'; 
import { 
  DashboardsService, 
  ExecutionService, 
  DashboardResponse, 
  WidgetResponse, 
  WidgetReorderRequest, 
  WidgetReorderItem, 
  WidgetCreate
} from '../api-client'; 

/** 
 * Normalized State Interface. 
 */ 
export interface DashboardState { 
  /** The currently active dashboard metadata. */ 
  dashboard: DashboardResponse | null; 
  /** List of widgets belonging to the dashboard. */ 
  widgets: WidgetResponse[]; 
  /** Execution results keyed by Widget ID. */ 
  dataMap: Record<string, any>; 
  /** Global loading indicator. */ 
  isLoading: boolean; 
  /** Set of Widget IDs currently refreshing individually. */ 
  loadingWidgetIds: ReadonlySet<string>; 
  /** last known error message. */ 
  error: string | null; 
  /** Dictionary of active global filters (e.g. { dept: 'Cardiology' }). */ 
  globalParams: Record<string, any>; 
  /** Toggle for Edit Mode (Enables Drag/Drop and Widget configuration). */ 
  isEditMode: boolean; 
  /** The ID of the widget currently in "Focus" (Full-screen) mode. Null if none. */ 
  focusedWidgetId: string | null; 
} 

const initialState: DashboardState = { 
  dashboard: null, 
  widgets: [], 
  dataMap: {}, 
  isLoading: false, 
  loadingWidgetIds: new Set(), 
  error: null, 
  globalParams: {}, 
  isEditMode: false, 
  focusedWidgetId: null
}; 

@Injectable({ providedIn: 'root' }) 
export class DashboardStore { 
  private readonly dashboardApi = inject(DashboardsService); 
  private readonly executionApi = inject(ExecutionService); 
  private readonly router = inject(Router); 

  // Private mutable signal for internal state updates
  private readonly _state = signal<DashboardState>(initialState); 

  // Subjects for managing RxJS streams (cancellation/switchMap) 
  private readonly refreshTrigger$ = new Subject<void>(); 
  private readonly destroy$ = new Subject<void>(); 

  /** Read-only view of the entire state tree. */ 
  readonly state = this._state.asReadonly(); 
  
  /** Signal: Critical entity computed selectors */ 
  readonly dashboard = computed(() => this._state().dashboard); 
  readonly widgets = computed(() => this._state().widgets); 
  readonly dataMap = computed(() => this._state().dataMap); 
  readonly isLoading = computed(() => this._state().isLoading); 
  readonly error = computed(() => this._state().error); 
  readonly globalParams = computed(() => this._state().globalParams); 
  readonly isEditMode = computed(() => this._state().isEditMode); 
  readonly focusedWidgetId = computed(() => this._state().focusedWidgetId); 

  /** 
   * Computed Selector Factory: Check if specific widget is loading. 
   * Usage: `store.isWidgetLoading()(id)`
   */ 
  readonly isWidgetLoading = computed(() => (id: string) => this._state().loadingWidgetIds.has(id)); 

  /** 
   * Computed: Returns the full widget object for the currently focused ID options. 
   */ 
  readonly focusedWidget = computed(() => { 
    const id = this.focusedWidgetId(); 
    if (!id) return null; 
    return this.widgets().find(w => w.id === id) || null; 
  }); 

  constructor() { 
    this.setupRefreshPipeline(); 
  } 

  /** 
   * Sets up the reactive pipeline for data refreshing. 
   * Uses `switchMap` to cancel pending requests if a new filter is applied rapidly. 
   */ 
  private setupRefreshPipeline(): void { 
    this.refreshTrigger$.pipe( 
      takeUntil(this.destroy$), 
      tap(() => this.patch({ isLoading: true, error: null })), 
      switchMap(() => { 
        const dash = this._state().dashboard; 
        if (!dash) return of({}); // No-op if no dashboard loaded

        const params = this._state().globalParams; 
        return this.executionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost(dash.id, params).pipe( 
          catchError(err => { 
            this.handleError(err); 
            return of(null); // Return null to indicate failure in stream
          }) 
        ); 
      }) 
    ).subscribe((result) => { 
      // Only patch if result is valid (non-null) 
      if (result) { 
        this.patch({ 
          isLoading: false, 
          dataMap: result as Record<string, any> 
        }); 
      } else { 
        this.patch({ isLoading: false }); 
      } 
    }); 
  } 

  /** 
   * Loads a dashboard by ID. 
   * Triggers an automatic data refresh upon success. 
   */ 
  loadDashboard(dashboardId: string): void { 
    this.patch({ isLoading: true, error: null, focusedWidgetId: null }); // Reset focus on nav
    this.dashboardApi.getDashboardApiV1DashboardsDashboardIdGet(dashboardId) 
      .subscribe({ 
        next: (res) => { 
            this.patch({ 
              isLoading: false, 
              dashboard: res, 
              widgets: res.widgets || [] 
            }); 
            // Auto-refresh data on load
            this.refreshTrigger$.next(); 
        }, 
        error: (err) => { 
          this.handleError(err); 
          this.patch({ isLoading: false }); 
        } 
      }); 
  } 

  /** 
   * Create a deep copy of an existing widget and add it to the dashboard. 
   * 
   * Logic: 
   * 1. Constructs a new title "Copy of X". 
   * 2. Offsets position by (1, 1). 
   * 3. Performs optimistic UI update via temporary widget. 
   * 4. Persists to backend. 
   * 
   * @param {WidgetResponse} source - The source widget to clone. 
   */ 
  duplicateWidget(source: WidgetResponse): void { 
    const dash = this.dashboard(); 
    if (!dash) return; 

    // 1. Deep Copy Config from immutable response
    const newConfig = structuredClone(source.config); 
    
    // 2. Adjust Layout (x+1, y+1) 
    // Grid assumes 12 columns max. 
    const currentX = (newConfig['x'] as number) || 0; 
    const currentY = (newConfig['y'] as number) || 0; 
    
    newConfig['x'] = Math.min(11, currentX + 1); 
    newConfig['y'] = currentY + 1; 

    const payload: WidgetCreate = { 
      title: `Copy of ${source.title}`, 
      type: source.type, 
      visualization: source.visualization, 
      config: newConfig 
    }; 

    // 3. Optimistic Update 
    const tempId = `temp-${Date.now()}`; 
    const tempWidget: WidgetResponse = { 
        id: tempId, 
        dashboard_id: dash.id, 
        ...payload 
    }; 
    
    // Insert into state immediately 
    this.patch({ widgets: [...this.widgets(), tempWidget] }); 

    // 4. API Persist 
    this.dashboardApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(dash.id, payload) 
      .subscribe({ 
        next: (realWidget: WidgetResponse) => { 
          // Replace temp with real 
          const updatedWidgets = this.widgets().map(w => w.id === tempId ? realWidget : w); 
          this.patch({ widgets: updatedWidgets }); 
          // Fetch data for the new widget 
          this.refreshWidget(realWidget.id); 
        }, 
        error: (err) => { 
          this.handleError(err); 
          // Rollback 
          this.optimisticRemoveWidget(tempId); 
        } 
      }); 
  } 

  /** 
   * Creates a new dashboard populated with defaults via the Restore endpoint. 
   * Transitions the user to the new dashboard upon success. 
   */ 
  createDefaultDashboard(): void { 
    this.patch({ isLoading: true, error: null }); 
    this.dashboardApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost() 
      .subscribe({ 
        next: (newDash: DashboardResponse) => { 
          this.patch({ isLoading: false }); 
          // Reset current state locally to avoid glitching 
          this.reset(); 
          // Navigate to the newly created dashboard
          // Force a router change detection by navigating even if logic thinks current route is same (rare) 
          this.router.navigate(['/dashboard', newDash.id]).then(() => { 
             // Pre-load the data 
             this.patch({ dashboard: newDash, widgets: newDash.widgets || [] }); 
             this.refreshAll(); 
          }); 
        }, 
        error: (err) => { 
          this.handleError(err); 
          this.patch({ isLoading: false }); 
        } 
      }); 
  } 

  /** 
   * Toggles the Dashboard Edit Mode. 
   */ 
  toggleEditMode(): void { 
    this.patch({ isEditMode: !this._state().isEditMode }); 
  } 

  /** 
   * Sets the specified widget as maximized/focused. 
   * Pass `null` to exit focus mode. 
   * 
   * @param {string | null} id - The UUID of the widget. 
   */ 
  setFocusedWidget(id: string | null): void { 
    this.patch({ focusedWidgetId: id }); 
  } 

  /** 
   * Syncs global parameters from an external source (e.g. Router QueryParams). 
   * Only triggers refresh if the value actually changed. 
   * 
   * @param {Record<string, any>} params - The new dictionary of params. 
   */ 
  setGlobalParams(params: Record<string, any>): void { 
    const current = this._state().globalParams; 
    
    // Simple shallow comparison check
    const keysA = Object.keys(current); 
    const keysB = Object.keys(params); 
    
    const hasChanged = keysA.length !== keysB.length || 
        keysB.some(key => current[key] !== params[key]); 

    if (hasChanged) { 
        this.patch({ globalParams: params }); 
        this.refreshTrigger$.next(); 
    } 
  } 

  /** 
   * Manually triggers a refresh of all widgets. 
   */ 
  refreshAll(): void { 
    this.refreshTrigger$.next(); 
  } 

  /** 
   * Refreshes a single widget. 
   * Currently triggers a full refresh to ensure consistency with global filters. 
   */ 
  refreshWidget(widgetId: string): void { 
    // Currently triggers full refresh for consistency
    this.refreshTrigger$.next(); 
  } 

  /** 
   * Resets the store to initial state. 
   */ 
  reset(): void { 
    this._state.set(initialState); 
  } 

  /** 
   * Handles drag-and-drop reordering logic. 
   * Updates local state immediately (Optimistic UI) and syncs with backend via Bulk Update. 
   */ 
  handleWidgetDrop( 
    sameContainer: boolean, 
    targetGroupId: string, 
    prevIndex: number, 
    currIndex: number, 
    containerData: WidgetResponse[], 
    prevContainerData: WidgetResponse[] 
  ): void { 
    const currentDashboard = this.dashboard(); 
    if (!currentDashboard) return; 

    // Note: 'containerData' from CDK is the visual state of the target lane. 
    // However, CDK mutates these arrays by reference usually. 
    // To be safe and purely reactive, we rebuild from the Store's Master List. 
    // But since the Component passes us the event result which might be the SOURCE of truth for the dropped item, 
    // let's locate the item first. 

    const movedWidget = sameContainer ? containerData[currIndex] : containerData[currIndex]; 
    
    // We need to construct the new Master List 
    let allWidgets = [...this._state().widgets]; 
    
    // Remove moved widget from list 
    allWidgets = allWidgets.filter(w => w.id !== movedWidget.id); 

    // Update moved widget config 
    const updatedWidget = { 
        ...movedWidget, 
        config: { ...movedWidget.config, group: targetGroupId } 
    }; 

    // Re-insert into master list. 
    // To do this correctly, we need to know where it fits relative to others in the Target Group. 
    // The 'currIndex' is relative to the Target Group array. 
    
    // 1. Get other widgets in target group, sorted by current order 
    const targetGroupWidgets = allWidgets 
        .filter(w => (w.config['group'] || 'General') === targetGroupId) 
        .sort((a, b) => (a.config['order'] || 0) - (b.config['order'] || 0)); 
    
    // 2. Insert at specific index 
    targetGroupWidgets.splice(currIndex, 0, updatedWidget); 

    // 3. Re-assign Order Indices for Target Group 
    const updates: WidgetReorderItem[] = []; 
    targetGroupWidgets.forEach((w, index) => { 
        w.config['order'] = index; 
        updates.push({ id: w.id, order: index, group: targetGroupId }); 
    }); 

    // 4. If moved across groups, we might need to re-index Source Group to fill gaps 
    if (!sameContainer) { 
        const sourceGroupId = movedWidget.config['group'] || 'General'; 
        const sourceGroupWidgets = allWidgets 
            .filter(w => (w.config['group'] || 'General') === sourceGroupId) 
            .sort((a, b) => (a.config['order'] || 0) - (b.config['order'] || 0)); 
        
        sourceGroupWidgets.forEach((w, index) => { 
            w.config['order'] = index; 
            updates.push({ id: w.id, order: index, group: sourceGroupId }); 
        }); 
    } 

    // 5. Merge updates back into Master List for Optimistic UI 
    const widgetMap = new Map(allWidgets.map(w => [w.id, w])); 
    targetGroupWidgets.forEach(w => widgetMap.set(w.id, w)); 
    
    const finalWidgets = Array.from(widgetMap.values()); 
    this.patch({ widgets: finalWidgets }); 

    // 6. API Bulk Update 
    const request: WidgetReorderRequest = { items: updates }; 
    this.dashboardApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost(currentDashboard.id, request) 
        .subscribe({ 
            error: (e) => { 
                this.handleError(e); 
                // Revert or reload on error would be ideal here 
                this.loadDashboard(currentDashboard.id); 
            } 
        }); 
  } 

  /** 
   * Optimistically removes a widget from the UI. 
   */ 
  optimisticRemoveWidget(id: string): void { 
    const current = this._state().widgets; 
    this.patch({ widgets: current.filter(w => w.id !== id) }); 
  } 

  /** 
   * Restores a widget to the UI (rollback). 
   */ 
  optimisticRestoreWidget(widget: WidgetResponse): void { 
    const current = this._state().widgets; 
    this.patch({ widgets: [...current, widget] }); 
  } 

  /** 
   * Helper to perform immutable state updates. 
   */ 
  private patch(p: Partial<DashboardState>) { 
    this._state.update(current => ({ ...current, ...p })); 
  } 

  /** 
   * Centralized error extraction. 
   * Maps partial/unknown errors to user-friendly messages. 
   */ 
  private handleError(e: unknown) { 
    let msg = 'An unexpected error occurred'; 
    if (e instanceof HttpErrorResponse) { 
      if (e.error?.detail) { 
        msg = typeof e.error.detail === 'string' ? e.error.detail : JSON.stringify(e.error.detail); 
      } else { 
        msg = e.message; 
      } 
    } else if (e instanceof Error) { 
      msg = e.message; 
    } 
    this.patch({ error: msg }); 
  } 
}