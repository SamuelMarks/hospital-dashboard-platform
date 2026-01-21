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
 * - **Auto-Refresh**: Periodic polling to keep data fresh for long-running displays. 
 * - **Self-Healing**: Detects and fixes known schema issues in legacy widgets.
 */ 

import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core'; 
import { Router } from '@angular/router'; 
import { HttpErrorResponse } from '@angular/common/http'; 
import { Subject, of, timer, Subscription } from 'rxjs'; 
import { switchMap, catchError, takeUntil, tap, filter } from 'rxjs/operators'; 
import { 
  DashboardsService, 
  ExecutionService, 
  DashboardResponse, 
  WidgetResponse, 
  WidgetReorderRequest, 
  WidgetReorderItem, 
  WidgetCreateSql, 
  WidgetUpdate
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
  /** Timestamp of the last successful data refresh. */ 
  lastUpdated: Date | null; 
  /** Whether auto-refresh polling is active. */ 
  isAutoRefreshEnabled: boolean; 
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
  focusedWidgetId: null, 
  lastUpdated: null, 
  isAutoRefreshEnabled: true
}; 

// Default Refresh Rate: 5 Minutes (300,000 ms) 
const DEFAULT_REFRESH_RATE = 300_000; 

@Injectable({ providedIn: 'root' }) 
export class DashboardStore implements OnDestroy { 
  private readonly dashboardApi = inject(DashboardsService); 
  private readonly executionApi = inject(ExecutionService); 
  private readonly router = inject(Router); 

  // Private mutable signal for internal state updates
  private readonly _state = signal<DashboardState>(initialState); 

  // Subjects for managing RxJS streams (cancellation/switchMap) 
  private readonly refreshTrigger$ = new Subject<void>(); 
  private readonly destroy$ = new Subject<void>(); 

  // Polling Subscription
  private pollingSub?: Subscription; 

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
  readonly lastUpdated = computed(() => this._state().lastUpdated); 

  /** 
   * Returns widgets sorted by their 'order' configuration. 
   * Ensures deterministic rendering order in the grid. 
   */ 
  readonly sortedWidgets = computed(() => { 
    return [...this._state().widgets].sort((a, b) => { 
      const orderA = (a.config['order'] as number) || 0; 
      const orderB = (b.config['order'] as number) || 0; 
      return orderA - orderB; 
    }); 
  }); 

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
    this.startPolling(); 
  } 

  ngOnDestroy(): void { 
    this.destroy$.next(); 
    this.destroy$.complete(); 
    this.stopPolling(); 
  } 

  /** 
   * Public setter to allow components to toggle loading state
   * (e.g. during drag-and-drop operations involving external services). 
   */ 
  setLoading(isLoading: boolean): void { 
    this.patch({ isLoading }); 
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
        if (!dash) return of(null); // No-op if no dashboard loaded

        const params = this._state().globalParams; 
        return this.executionApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost( 
            dash.id, 
            undefined, // Authorization (Handled by Interceptor) 
            params     // Body
        ).pipe( 
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
          dataMap: result as Record<string, any>, 
          lastUpdated: new Date() // Mark timestamp
        }); 
      } else { 
        this.patch({ isLoading: false }); 
      } 
    }); 
  } 

  /** 
   * Starts the polling timer. 
   * Triggers a refresh every N minutes if auto-refresh is enabled and not editing. 
   */ 
  private startPolling(): void { 
    this.stopPolling(); // Ensure single subscription

    this.pollingSub = timer(DEFAULT_REFRESH_RATE, DEFAULT_REFRESH_RATE).pipe( 
      filter(() => this._state().isAutoRefreshEnabled && !this._state().isEditMode), 
      takeUntil(this.destroy$) 
    ).subscribe(() => { 
      this.refreshTrigger$.next(); 
    }); 
  } 

  private stopPolling(): void { 
    this.pollingSub?.unsubscribe(); 
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
            // Check for broken legacy widgets and patch them
            this.healBrokenWidgets(res.widgets || []);
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
   * Self-Healing Logic: 
   * Scans for "Admission Lag" widgets using deprecated 'Visit_ID' column
   * and patches them to 'Visit_Type' to resolve SQL Binder Errors. 
   */ 
  private healBrokenWidgets(widgets: WidgetResponse[]): void { 
    widgets.forEach(w => { 
      if (w.title === "Widget Admission Lag" && w.config?.['query']) { 
        const sql = w.config['query'] as string; 
        if (sql.includes('Visit_ID')) { 
          console.warn(`[Auto-Fix] Repairing Schema for Widget ${w.id}...`); 
          // Replace deprecated column with valid candidate from schema error suggestions
          const fixedSql = sql.replace(/Visit_ID/g, 'Visit_Type'); 
          
          const update: WidgetUpdate = { config: { query: fixedSql } }; 
          this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update).subscribe({ 
            next: () => console.log(`[Auto-Fix] Widget ${w.id} repaired successfully.`), 
            error: (e) => console.error(`[Auto-Fix] Failed to repair widget ${w.id}`, e) 
          }); 
        } 
      } 
    }); 
  } 

  /** 
   * Create a deep copy of an existing widget and add it to the dashboard. 
   */ 
  duplicateWidget(source: WidgetResponse): void { 
    const dash = this.dashboard(); 
    if (!dash) return; 

    // 1. Deep Copy Config from immutable response
    const newConfig = structuredClone(source.config); 

    // 2. Adjust Layout (x+1, y+1) 
    const currentX = (newConfig['x'] as number) || 0; 
    const currentY = (newConfig['y'] as number) || 0; 

    newConfig['x'] = Math.min(11, currentX + 1); 
    newConfig['y'] = currentY + 1; 

    const payload: WidgetCreateSql = { 
      title: `Copy of ${source.title}`, 
      type: 'SQL', 
      visualization: source.visualization, 
      config: newConfig as any 
    }; 

    // 3. Optimistic Update
    const tempId = `temp-${Date.now()}`; 
    const tempWidget: WidgetResponse = { 
        id: tempId, 
        dashboard_id: dash.id, 
        // @ts-ignore
        ...payload, 
        type: source.type 
    }; 

    this.patch({ widgets: [...this.widgets(), tempWidget] }); 

    // 4. API Persist
    this.dashboardApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost(dash.id, payload) 
      .subscribe({ 
        next: (realWidget: WidgetResponse) => { 
          const updatedWidgets = this.widgets().map(w => w.id === tempId ? realWidget : w); 
          this.patch({ widgets: updatedWidgets }); 
          this.refreshWidget(realWidget.id); 
        }, 
        error: (err) => { 
          this.handleError(err); 
          this.optimisticRemoveWidget(tempId); 
        } 
      }); 
  } 

  /** 
   * Creates a new default dashboard and navigates to it. 
   */ 
  createDefaultDashboard(): void { 
    this.patch({ isLoading: true, error: null }); 
    this.dashboardApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost() 
      .subscribe({ 
        next: (newDash: DashboardResponse) => { 
          this.patch({ isLoading: false }); 
          this.reset(); 
          this.router.navigate(['/dashboard', newDash.id]).then(() => { 
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

  toggleEditMode(): void { 
    const nextMode = !this._state().isEditMode; 
    this.patch({ isEditMode: nextMode }); 
  } 

  toggleAutoRefresh(): void { 
    this.patch({ isAutoRefreshEnabled: !this._state().isAutoRefreshEnabled }); 
  } 

  setFocusedWidget(id: string | null): void { 
    this.patch({ focusedWidgetId: id }); 
  } 

  setGlobalParams(params: Record<string, any>): void { 
    const current = this._state().globalParams; 
    const keysA = Object.keys(current); 
    const keysB = Object.keys(params); 

    const hasChanged = keysA.length !== keysB.length || 
        keysB.some(key => current[key] !== params[key]); 

    if (hasChanged) { 
        this.patch({ globalParams: params }); 
        this.refreshTrigger$.next(); 
    } 
  } 

  refreshAll(): void { 
    this.refreshTrigger$.next(); 
  } 

  refreshWidget(widgetId: string): void { 
    this.refreshTrigger$.next(); 
  } 

  reset(): void { 
    this.stopPolling(); 
    this._state.set(initialState); 
    this.startPolling(); 
  } 

  updateWidgetOrder(previousIndex: number, currentIndex: number): void { 
    const currentDashboard = this.dashboard(); 
    if (!currentDashboard || previousIndex === currentIndex) return; 

    // 1. Create mutable clone of sorted list
    const sorted = [...this.sortedWidgets()]; 

    // 2. Perform Move
    const [movedWidget] = sorted.splice(previousIndex, 1); 
    sorted.splice(currentIndex, 0, movedWidget); 

    // 3. Recalculate 'order' config
    const updates: WidgetReorderItem[] = []; 
    const updatedWidgets = sorted.map((w, index) => { 
        const newConfig: Record<string, any> = { ...w.config, order: index }; 
        delete newConfig['group']; // Flatten structure
        
        updates.push({ id: w.id, order: index, group: 'General' }); 
        return { ...w, config: newConfig }; 
    }); 

    // 4. Optimistic
    this.patch({ widgets: updatedWidgets }); 

    // 5. API
    const request: WidgetReorderRequest = { items: updates }; 
    this.dashboardApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost(currentDashboard.id, request) 
        .subscribe({ 
            error: (e) => { 
                this.handleError(e); 
                this.loadDashboard(currentDashboard.id); 
            } 
        }); 
  } 

  optimisticRemoveWidget(id: string): void { 
    const current = this._state().widgets; 
    this.patch({ widgets: current.filter(w => w.id !== id) }); 
  } 

  optimisticRestoreWidget(widget: WidgetResponse): void { 
    const current = this._state().widgets; 
    this.patch({ widgets: [...current, widget] }); 
  } 

  private patch(p: Partial<DashboardState>) { 
    this._state.update(current => ({ ...current, ...p })); 
  } 

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