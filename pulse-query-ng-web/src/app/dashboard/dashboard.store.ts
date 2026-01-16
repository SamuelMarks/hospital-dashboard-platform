/** 
 * @fileoverview Centralized State Management for the Dashboard Feature. 
 * 
 * Manages: 
 * - Dashboard Metadata & Widget Configuration. 
 * - Execution Data (Results of SQL/HTTP queries). 
 * - Layout State (Drag & Drop positioning). 
 * - Global Filtering Parameters. 
 */ 

import { Injectable, signal, computed, inject, Signal } from '@angular/core'; 
import { Router } from '@angular/router'; 
import { HttpErrorResponse } from '@angular/common/http'; 
import { Subject, of } from 'rxjs'; 
import { switchMap, catchError, takeUntil, tap } from 'rxjs/operators'; 
import { DashboardsService, ExecutionService, DashboardResponse, WidgetResponse, WidgetUpdate } from '../api-client'; 

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
} 

const initialState: DashboardState = { 
  dashboard: null, 
  widgets: [], 
  dataMap: {}, 
  isLoading: false, 
  loadingWidgetIds: new Set(), 
  error: null, 
  globalParams: {} 
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

  /** 
   * Computed Selector Factory: Check if specific widget is loading. 
   * Usage: `store.isWidgetLoading()(id)`
   */ 
  readonly isWidgetLoading = computed(() => (id: string) => this._state().loadingWidgetIds.has(id)); 

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
    this.patch({ isLoading: true, error: null }); 
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
   * Updates a specific global parameter. 
   * Automatically triggers a data refresh via the pipeline. 
   * 
   * @param {string} key - The parameter name (e.g., 'dept'). 
   * @param {any} value - The value. Null/Empty removes the key. 
   */ 
  updateGlobalParam(key: string, value: any): void { 
    const current = { ...this._state().globalParams }; 
    if (value === null || value === '' || value === undefined) { 
        delete current[key]; 
    } else { 
        current[key] = value; 
    } 
    this.patch({ globalParams: current }); 
    // Trigger pipeline
    this.refreshTrigger$.next(); 
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
   * Future optimization: Add endpoint for single-widget execution if supported. 
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
   * Updates local state immediately (Optimistic UI) and syncs with backend. 
   * 
   * @param {boolean} sameContainer - True if sorting within same list. 
   * @param {string} targetGroupId - The ID of the lane dropped into. 
   * @param {number} prevIndex - Previous index in array. 
   * @param {number} currIndex - New index in array. 
   * @param {WidgetResponse[]} containerData - The target array state. 
   * @param {WidgetResponse[]} prevContainerData - The source array if different. 
   */ 
  handleWidgetDrop( 
    sameContainer: boolean, 
    targetGroupId: string, 
    prevIndex: number, 
    currIndex: number, 
    containerData: WidgetResponse[], 
    prevContainerData: WidgetResponse[] 
  ): void { 
    // CDK modifies the arrays passed to it by reference if connected via [cdkDropListData]. 
    // Since we receive the *result* arrays, we need to persist these changes. 
    
    // 1. Identify modified widget
    const movedWidget = containerData[currIndex]; 
    if (!movedWidget) return; 

    // 2. Optimistic Update
    const updatedWidgets = this._state().widgets.map(w => { 
      if (w.id === movedWidget.id) { 
        return { 
          ...w, 
          config: { ...w.config, group: targetGroupId } 
        }; 
      } 
      return w; 
    }); 
    
    this.patch({ widgets: updatedWidgets }); 

    // 3. API Persist
    const update: WidgetUpdate = { 
      config: { ...movedWidget.config, group: targetGroupId } 
    }; 
    
    this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(movedWidget.id, update) 
      .subscribe({ error: (e) => this.handleError(e) }); 
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