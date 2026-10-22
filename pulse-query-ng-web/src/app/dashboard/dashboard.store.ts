/**
 * @fileoverview Centralized reactive state store for Hospital Dashboards and Widgets.
 *
 * Delegates grid sorting and coordinate calculation to `dashboard-grid-layout.utils.ts`,
 * offline snapshot persistence to `DashboardOfflineCacheService`, and HTTP error message
 * extraction to `extractApiErrorMessage` (`error.utils.ts`).
 */

import { DATE_NOW } from '../core/time.token';
import { signal, computed, inject, OnDestroy, Service } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of, timer, Subscription } from 'rxjs';
import { switchMap, catchError, takeUntil, tap, filter, finalize } from 'rxjs/operators';
import {
  DashboardsService,
  ExecutionService,
  DashboardResponse,
  WidgetResponse,
  WidgetCreateSql,
  WidgetCreateHttp,
  WidgetCreateText,
  WidgetIn,
} from '../api-client';
import { UndoRedoService } from '../core/undo/undo-redo.service';
import { ReorderWidgetsCommand, AddWidgetCommand } from '../core/undo/dashboard-commands';
import { extractApiErrorMessage } from '../core/error.utils';
import { offsetWidgetCoordinates, sortWidgetsByOrder } from './dashboard-grid-layout.utils';
import { DashboardOfflineCacheService } from './dashboard-offline-cache.service';
import { WidgetExecutionPayload } from './dashboard.models';

/**
 * Immutable state snapshot managed by `DashboardStore`.
 */
export interface DashboardState {
  /** Currently active dashboard metadata and widget list. */
  dashboard: DashboardResponse | null;
  /** Active widgets belonging to the current dashboard. */
  widgets: WidgetResponse[];
  /** Map of widget UUIDs to their latest execution payloads. */
  dataMap: Record<string, WidgetExecutionPayload>;
  /** Whether a dashboard load or full refresh is currently in flight. */
  isLoading: boolean;
  /** Set of widget UUIDs currently refreshing individually. */
  loadingWidgetIds: ReadonlySet<string>;
  /** Latest user-facing error message, or `null` if healthy. */
  error: string | null;
  /** Global filter parameters injected into SQL widgets (`department`, `date_range`, etc.). */
  globalParams: Record<string, unknown>;
  /** Whether the dashboard layout is currently in drag-and-drop edit mode. */
  isEditMode: boolean;
  /** UUID of the currently keyboard-focused widget, or `null`. */
  focusedWidgetId: string | null;
  /** Timestamp of the most recent widget data refresh. */
  lastUpdated: Date | null;
  /** Whether periodic background auto-refresh polling is enabled. */
  isAutoRefreshEnabled: boolean;
}

/** Default initial state for the dashboard store. */
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
  isAutoRefreshEnabled: true,
};

/** Default interval in milliseconds between automatic background dashboard refreshes. */
const DEFAULT_REFRESH_RATE = 300_000;

/**
 * Signal-based store orchestrating dashboard CRUD, widget execution, undo/redo, and offline caching.
 */
@Service()
export class DashboardStore implements OnDestroy {
  /** Injected clock factory returning the current `Date`. */
  private readonly dateNow = inject(DATE_NOW);

  /** Generated OpenAPI client for dashboard and widget CRUD operations. */
  private readonly dashboardApi = inject(DashboardsService);

  /** Generated OpenAPI client for dashboard and widget execution endpoints. */
  private readonly executionApi = inject(ExecutionService);

  /** Angular router used when navigating to newly restored default dashboards. */
  private readonly router = inject(Router);

  /** Undo/redo command stack service. */
  private readonly undoRedoService = inject(UndoRedoService);

  /** Offline snapshot cache service backed by `localStorage`. */
  private readonly offlineCache = inject(DashboardOfflineCacheService);

  /** Internal writable state signal. */
  private readonly _state = signal<DashboardState>(initialState);

  /** Stream triggering full dashboard execution refreshes. */
  private readonly refreshTrigger$ = new Subject<void>();

  /** Stream emitted when switching dashboards to cancel stale in-flight requests. */
  private readonly dashboardSwitch$ = new Subject<void>();

  /** Stream emitted when the store is destroyed. */
  private readonly destroy$ = new Subject<void>();

  /** Active subscription for periodic background polling. */
  private pollingSub?: Subscription;

  /** Read-only view of the complete `DashboardState`. */
  readonly state = this._state.asReadonly();

  /** Currently loaded dashboard metadata, or `null`. */
  readonly dashboard = computed(() => this._state().dashboard);

  /** Unsorted array of widgets belonging to the active dashboard. */
  readonly widgets = computed(() => this._state().widgets);

  /** Map of widget UUIDs to their latest execution payloads. */
  readonly dataMap = computed(() => this._state().dataMap);

  /** Whether a dashboard load or batch refresh is currently in progress. */
  readonly isLoading = computed(() => this._state().isLoading);

  /** Latest error message string, or `null`. */
  readonly error = computed(() => this._state().error);

  /** Active global filter parameters. */
  readonly globalParams = computed(() => this._state().globalParams);

  /** Whether edit mode is currently active. */
  readonly isEditMode = computed(() => this._state().isEditMode);

  /** Currently focused widget UUID, or `null`. */
  readonly focusedWidgetId = computed(() => this._state().focusedWidgetId);

  /** Timestamp of the last completed refresh, or `null`. */
  readonly lastUpdated = computed(() => this._state().lastUpdated);

  /** Widgets sorted in ascending order by `config.order`. */
  readonly sortedWidgets = computed(() => sortWidgetsByOrder(this._state().widgets));

  /** Predicate function returning `true` if a given widget UUID is currently refreshing. */
  readonly isWidgetLoading = computed(() => (id: string) => this._state().loadingWidgetIds.has(id));

  /** Currently focused `WidgetResponse` object, or `null` if none is focused. */
  readonly focusedWidget = computed(() => {
    const id = this.focusedWidgetId();
    if (!id) return null;
    return this.widgets().find((w) => w.id === id) || null;
  });

  /**
   * Initializes the reactive refresh pipeline and starts background auto-refresh polling.
   */
  constructor() {
    this.setupRefreshPipeline();
    this.startPolling();
  }

  /**
   * Cancels all active subscriptions and stops polling when the store is destroyed.
   */
  ngOnDestroy(): void {
    this.dashboardSwitch$.next();
    this.dashboardSwitch$.complete();
    this.destroy$.next();
    this.destroy$.complete();
    this.stopPolling();
  }

  /**
   * Explicitly updates the `isLoading` state flag.
   *
   * @param isLoading - New loading state boolean.
   */
  setLoading(isLoading: boolean): void {
    this.patch({ isLoading });
  }

  /**
   * Subscribes to `refreshTrigger$` and executes batch dashboard refreshes with `switchMap`.
   */
  private setupRefreshPipeline(): void {
    this.refreshTrigger$
      .pipe(
        takeUntil(this.destroy$),
        tap(() => this.patch({ isLoading: true, error: null })),
        switchMap(() => {
          const dash = this._state().dashboard;
          if (!dash) return of(null);

          const params = this._state().globalParams;
          return this.executionApi
            .refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
              dash.id,
              undefined,
              undefined,
              undefined,
              params,
            )
            .pipe(
              catchError((err: unknown) => {
                this.handleError(err);
                return of(null);
              }),
            );
        }),
      )
      .subscribe((result) => {
        if (result) {
          const nextDataMap = result as Record<string, WidgetExecutionPayload>;
          const now = this.dateNow();
          this.patch({
            isLoading: false,
            dataMap: nextDataMap,
            lastUpdated: now,
          });
          const dash = this._state().dashboard;
          if (dash) {
            this.offlineCache.saveSnapshot(dash, nextDataMap, now);
          }
        } else {
          this.patch({ isLoading: false });
        }
      });
  }

  /**
   * Starts the periodic background timer that triggers refreshes when auto-refresh is enabled.
   */
  private startPolling(): void {
    this.stopPolling();
    this.pollingSub = timer(DEFAULT_REFRESH_RATE, DEFAULT_REFRESH_RATE)
      .pipe(
        filter(() => this._state().isAutoRefreshEnabled && !this._state().isEditMode),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        this.refreshTrigger$.next();
      });
  }

  /**
   * Unsubscribes the periodic background polling timer if active.
   */
  private stopPolling(): void {
    this.pollingSub?.unsubscribe();
  }

  /**
   * Loads a dashboard by ID from the backend (falling back to `DashboardOfflineCacheService` on failure).
   *
   * @param dashboardId - Target dashboard UUID to load.
   */
  loadDashboard(dashboardId: string): void {
    this.dashboardSwitch$.next();
    this.patch({ isLoading: true, error: null, focusedWidgetId: null });
    this.dashboardApi
      .getDashboardApiV1DashboardsDashboardIdGet(dashboardId)
      .pipe(takeUntil(this.dashboardSwitch$), takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.patch({
            isLoading: false,
            dashboard: res,
            widgets: res.widgets || [],
          });
          this.refreshTrigger$.next();
        },
        error: (err: unknown) => {
          const cached = this.offlineCache.loadSnapshot(dashboardId);
          if (cached) {
            this.patch({
              isLoading: false,
              dashboard: cached.dashboard,
              widgets: cached.dashboard.widgets || [],
              dataMap: cached.dataMap,
            });
          } else {
            this.patch({ isLoading: false });
          }
          this.handleError(err);
        },
      });
  }

  /**
   * Duplicates an existing widget within the active dashboard, offsetting position coordinates
   * and creating a typed payload matching the source widget kind.
   *
   * @param source - Widget to duplicate.
   */
  duplicateWidget(source: WidgetResponse): void {
    const dash = this.dashboard();
    if (!dash) return;

    const newConfig = offsetWidgetCoordinates(source.config);

    let payload: WidgetIn;
    if (source.type === 'HTTP') {
      payload = {
        title: $localize`Copy of ${source.title}`,
        type: 'HTTP',
        visualization: source.visualization,
        config: newConfig as unknown as WidgetCreateHttp['config'],
      };
    } else if (source.type === 'TEXT') {
      payload = {
        title: $localize`Copy of ${source.title}`,
        type: 'TEXT',
        visualization: 'markdown',
        config: newConfig as unknown as WidgetCreateText['config'],
      };
    } else {
      payload = {
        title: $localize`Copy of ${source.title}`,
        type: 'SQL',
        visualization: source.visualization,
        config: newConfig as unknown as WidgetCreateSql['config'],
      };
    }

    const tempId = `temp-${this.dateNow().getTime()}`;
    const tempWidget: WidgetResponse = {
      id: tempId,
      dashboard_id: dash.id,
      title: payload.title,
      type: source.type,
      visualization: source.type === 'TEXT' ? 'markdown' : source.visualization,
      config: newConfig,
    };

    this.patch({ widgets: [...this.widgets(), tempWidget] });

    this.dashboardApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(dash.id, payload)
      .pipe(takeUntil(this.dashboardSwitch$), takeUntil(this.destroy$))
      .subscribe({
        next: (realWidget: WidgetResponse) => {
          const updatedWidgets = this.widgets().map((w) => (w.id === tempId ? realWidget : w));
          this.patch({ widgets: updatedWidgets });
          this.refreshWidget(realWidget.id);
          this.undoRedoService.execute(
            new AddWidgetCommand(realWidget, this.dashboardApi, this, this.dateNow()),
          );
        },
        error: (err: unknown) => {
          this.handleError(err);
          this.optimisticRemoveWidget(tempId);
        },
      });
  }

  /**
   * Restores the default Hospital Command Center dashboard and navigates to it.
   */
  createDefaultDashboard(): void {
    this.patch({ isLoading: true, error: null });
    this.dashboardApi
      .restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (newDash: DashboardResponse) => {
          this.router.navigate(['/dashboard', newDash.id]).then(() => {
            this.patch({ isLoading: false });
          });
        },
        error: (err: unknown) => {
          this.handleError(err);
          this.patch({ isLoading: false });
        },
      });
  }

  /**
   * Toggles dashboard layout edit mode on or off.
   */
  toggleEditMode(): void {
    const nextMode = !this._state().isEditMode;
    this.patch({ isEditMode: nextMode });
  }

  /**
   * Toggles background auto-refresh polling on or off.
   */
  toggleAutoRefresh(): void {
    this.patch({ isAutoRefreshEnabled: !this._state().isAutoRefreshEnabled });
  }

  /**
   * Sets the currently keyboard-focused widget ID.
   *
   * @param id - Widget UUID to focus, or `null` to clear focus.
   */
  setFocusedWidget(id: string | null): void {
    this.patch({ focusedWidgetId: id });
  }

  /**
   * Updates global SQL filter parameters and triggers a dashboard refresh if values changed.
   *
   * @param params - Map of global filter key-value pairs.
   */
  setGlobalParams(params: Record<string, unknown>): void {
    const current = this._state().globalParams;
    const keysA = Object.keys(current);
    const keysB = Object.keys(params);

    const hasChanged =
      keysA.length !== keysB.length || keysB.some((key) => current[key] !== params[key]);

    if (hasChanged) {
      this.patch({ globalParams: params });
      this.refreshTrigger$.next();
    }
  }

  /**
   * Triggers an immediate batch refresh of all widgets on the active dashboard.
   */
  refreshAll(): void {
    this.refreshTrigger$.next();
  }

  /**
   * Refreshes query execution data for a single widget.
   *
   * @param widgetId - Unique UUID of the widget to refresh.
   * @param forceRefresh - Whether to bypass cached results.
   */
  refreshWidget(widgetId: string, forceRefresh = false): void {
    const dash = this.dashboard();
    if (!dash || !widgetId) return;

    const currentLoading = new Set(this._state().loadingWidgetIds);
    currentLoading.add(widgetId);
    this.patch({ loadingWidgetIds: currentLoading, error: null });

    this.executionApi
      .refreshWidgetApiV1DashboardsDashboardIdWidgetsWidgetIdRefreshPost(
        dash.id,
        widgetId,
        forceRefresh,
      )
      .pipe(
        takeUntil(this.dashboardSwitch$),
        takeUntil(this.destroy$),
        finalize(() => {
          const updatedLoading = new Set(this._state().loadingWidgetIds);
          updatedLoading.delete(widgetId);
          this.patch({ loadingWidgetIds: updatedLoading });
        }),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            const currentData: Record<string, WidgetExecutionPayload> = {
              ...this._state().dataMap,
            };
            const widgetPayload = (result as Record<string, WidgetExecutionPayload>)[widgetId];
            currentData[widgetId] = widgetPayload;
            this.patch({
              dataMap: currentData,
              lastUpdated: this.dateNow(),
            });
          }
        },
        error: (err: unknown) => {
          this.handleError(err);
        },
      });
  }

  /**
   * Sets the complete widget array in store state.
   *
   * @param widgets - New widget array.
   */
  setWidgets(widgets: WidgetResponse[]): void {
    this.patch({ widgets });
  }

  /**
   * Resets store state to `initialState` and restarts polling.
   */
  reset(): void {
    this.dashboardSwitch$.next();
    this.stopPolling();
    this._state.set(initialState);
    this.startPolling();
  }

  /**
   * Reorders widgets from `previousIndex` to `currentIndex` via an undoable `ReorderWidgetsCommand`.
   *
   * @param previousIndex - Starting index in `sortedWidgets()`.
   * @param currentIndex - Target index in `sortedWidgets()`.
   */
  updateWidgetOrder(previousIndex: number, currentIndex: number): void {
    const currentDashboard = this.dashboard();
    if (!currentDashboard || previousIndex === currentIndex) return;

    const previousWidgets = [...this.sortedWidgets()];
    const sorted = [...previousWidgets];
    const [movedWidget] = sorted.splice(previousIndex, 1);
    if (!movedWidget) return;
    sorted.splice(currentIndex, 0, movedWidget);

    this.undoRedoService.execute(
      new ReorderWidgetsCommand(
        currentDashboard.id,
        previousWidgets,
        sorted,
        this.dashboardApi,
        this,
        this.dateNow(),
      ),
    );
  }

  /**
   * Optimistically removes a widget from local state by ID.
   *
   * @param id - Widget UUID to remove.
   */
  optimisticRemoveWidget(id: string): void {
    const current = this._state().widgets;
    this.patch({ widgets: current.filter((w) => w.id !== id) });
  }

  /**
   * Optimistically appends a restored widget back into local state.
   *
   * @param widget - `WidgetResponse` to restore.
   */
  optimisticRestoreWidget(widget: WidgetResponse): void {
    const current = this._state().widgets;
    this.patch({ widgets: [...current, widget] });
  }

  /**
   * Merges a partial state update into `_state`.
   *
   * @param p - Partial `DashboardState` fields to update.
   */
  private patch(p: Partial<DashboardState>): void {
    this._state.update((current) => ({ ...current, ...p }));
  }

  /**
   * Formats an API error via `extractApiErrorMessage` and updates the `error` state.
   *
   * @param e - Caught error value.
   */
  private handleError(e: unknown): void {
    const msg = extractApiErrorMessage(e, $localize`An unexpected error occurred`);
    this.patch({ error: msg });
  }
}
