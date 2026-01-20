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
  WidgetCreateSql
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
        // Fix: Pass undefined for optional auth param, pass params as body
        // Generated: refresh(id, auth?, body?) or refresh(id, body?, auth?)
        // Error TS2769 Argument of type 'Record' is not assignable to 'string' typically means
        // we hit the 'auth' string param position with the object.
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
      // Trigger refresh pipeline (does NOT reset loading state immediately to avoid flickers if desired,
      // but current pipeline standardizes loading state)
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

    // Fix: Explicitly cast to WidgetCreateSql (or appropriate subtype) for API compatibility
    // Assuming source is valid, we preserve type.
    const payload: WidgetCreateSql = {
      title: `Copy of ${source.title}`,
      type: 'SQL', // Explicitly set for type safety if source was SQL
      visualization: source.visualization,
      config: newConfig as any // Type assertion for config structure
    };

    // 3. Optimistic Update
    const tempId = `temp-${Date.now()}`;
    const tempWidget: WidgetResponse = {
        id: tempId,
        dashboard_id: dash.id,
        // @ts-ignore
        ...payload,
        type: source.type // Restore original type string for local state
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
   * Pauses auto-refresh while editing to prevent state jumps.
   */
  toggleEditMode(): void {
    const nextMode = !this._state().isEditMode;
    this.patch({ isEditMode: nextMode });
  }

  /**
   * Toggles the Auto-Refresh Polling.
   */
  toggleAutoRefresh(): void {
    this.patch({ isAutoRefreshEnabled: !this._state().isAutoRefreshEnabled });
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
   * Resets the polling timer logic implicitly via the stream update.
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
    this.stopPolling();
    this._state.set(initialState);
    this.startPolling(); // Restart fresh
  }

  /**
   * Handles drag-and-drop widget reordering within a single grid context.
   * Recalculates index based on the flattened list and persists new order to backend.
   *
   * @param {number} previousIndex - The index before drag.
   * @param {number} currentIndex - The new index after drop.
   */
  updateWidgetOrder(previousIndex: number, currentIndex: number): void {
    const currentDashboard = this.dashboard();
    if (!currentDashboard || previousIndex === currentIndex) return;

    // 1. Create mutable clone of sorted list
    const sorted = [...this.sortedWidgets()];

    // 2. Perform Move
    const [movedWidget] = sorted.splice(previousIndex, 1);
    sorted.splice(currentIndex, 0, movedWidget);

    // 3. Recalculate 'order' config for all widgets
    // Also stripping legacy 'group' config to enforce flat grid behavior.
    const updates: WidgetReorderItem[] = [];
    const updatedWidgets = sorted.map((w, index) => {
        // Deep clone configs to avoid mutation side-effects before patch
        // Fix: Explicitly type as Record<string, any> to allow 'delete'
        const newConfig: Record<string, any> = { ...w.config, order: index };

        // Remove group property if it exists to strictly flatten layout intent
        delete newConfig['group'];

        updates.push({ id: w.id, order: index, group: 'General' });

        return { ...w, config: newConfig };
    });

    // 4. Update Local State (Optimistic)
    this.patch({ widgets: updatedWidgets });

    // 5. API Persistence
    const request: WidgetReorderRequest = { items: updates };
    this.dashboardApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost(currentDashboard.id, request)
        .subscribe({
            error: (e) => {
                this.handleError(e);
                // Revert state on error by reloading
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