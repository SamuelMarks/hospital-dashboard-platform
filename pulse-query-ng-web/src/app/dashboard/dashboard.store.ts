// pulse-query-ng-web/src/app/dashboard/dashboard.store.ts
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
  WidgetUpdate,
} from '../api-client';

export interface DashboardState {
  dashboard: DashboardResponse | null;
  widgets: WidgetResponse[];
  dataMap: Record<string, any>;
  isLoading: boolean;
  loadingWidgetIds: ReadonlySet<string>;
  error: string | null;
  globalParams: Record<string, any>;
  isEditMode: boolean;
  focusedWidgetId: string | null;
  lastUpdated: Date | null;
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
  isAutoRefreshEnabled: true,
};

const DEFAULT_REFRESH_RATE = 300_000;

@Injectable({ providedIn: 'root' })
export class DashboardStore implements OnDestroy {
  private readonly dashboardApi = inject(DashboardsService);
  private readonly executionApi = inject(ExecutionService);
  private readonly router = inject(Router);

  /* v8 ignore next */
  private readonly _state = signal<DashboardState>(initialState);
  private readonly refreshTrigger$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();
  private pollingSub?: Subscription;

  readonly state = this._state.asReadonly();
  /* v8 ignore next */
  readonly dashboard = computed(() => this._state().dashboard);
  /* v8 ignore next */
  readonly widgets = computed(() => this._state().widgets);
  /* v8 ignore next */
  readonly dataMap = computed(() => this._state().dataMap);
  /* v8 ignore next */
  readonly isLoading = computed(() => this._state().isLoading);
  /* v8 ignore next */
  readonly error = computed(() => this._state().error);
  /* v8 ignore next */
  readonly globalParams = computed(() => this._state().globalParams);
  /* v8 ignore next */
  readonly isEditMode = computed(() => this._state().isEditMode);
  /* v8 ignore next */
  readonly focusedWidgetId = computed(() => this._state().focusedWidgetId);
  /* v8 ignore next */
  readonly lastUpdated = computed(() => this._state().lastUpdated);

  /* v8 ignore next */
  readonly sortedWidgets = computed(() => {
    return [...this._state().widgets].sort((a, b) => {
      const orderA = (a.config['order'] as number) || 0;
      const orderB = (b.config['order'] as number) || 0;
      return orderA - orderB;
    });
  });

  /* v8 ignore next */
  readonly isWidgetLoading = computed(() => (id: string) => this._state().loadingWidgetIds.has(id));

  /* v8 ignore next */
  readonly focusedWidget = computed(() => {
    const id = this.focusedWidgetId();
    if (!id) return null;
    return this.widgets().find((w) => w.id === id) || null;
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

  setLoading(isLoading: boolean): void {
    this.patch({ isLoading });
  }

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
            .refreshDashboardApiV1DashboardsDashboardIdRefreshPost(dash.id, undefined, params)
            .pipe(
              catchError((err) => {
                this.handleError(err);
                return of(null);
              }),
            );
        }),
      )
      .subscribe((result) => {
        if (result) {
          this.patch({
            isLoading: false,
            dataMap: result as Record<string, any>,
            lastUpdated: new Date(),
          });
        } else {
          this.patch({ isLoading: false });
        }
      });
  }

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

  private stopPolling(): void {
    this.pollingSub?.unsubscribe();
  }

  loadDashboard(dashboardId: string): void {
    this.patch({ isLoading: true, error: null, focusedWidgetId: null });
    this.dashboardApi.getDashboardApiV1DashboardsDashboardIdGet(dashboardId).subscribe({
      next: (res) => {
        this.patch({
          isLoading: false,
          dashboard: res,
          widgets: res.widgets || [],
        });
        this.healBrokenWidgets(res.widgets || []);
        this.refreshTrigger$.next();
      },
      error: (err) => {
        this.handleError(err);
        this.patch({ isLoading: false });
      },
    });
  }

  private healBrokenWidgets(widgets: WidgetResponse[]): void {
    widgets.forEach((w) => {
      if (w.title === 'Widget Admission Lag' && w.config?.['query']) {
        const sql = w.config['query'] as string;
        if (sql.includes('Visit_ID')) {
          console.warn(`[Auto-Fix] Repairing Schema for Widget ${w.id}...`);
          const fixedSql = sql.replace(/Visit_ID/g, 'Visit_Type');

          const update: WidgetUpdate = { config: { query: fixedSql } };
          this.dashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut(w.id, update).subscribe({
            next: () => console.log(`[Auto-Fix] Widget ${w.id} repaired successfully.`),
            error: (e) => console.error(`[Auto-Fix] Failed to repair widget ${w.id}`, e),
          });
        }
      }
    });
  }

  duplicateWidget(source: WidgetResponse): void {
    const dash = this.dashboard();
    if (!dash) return;

    const newConfig = structuredClone(source.config);
    const currentX = (newConfig['x'] as number) || 0;
    const currentY = (newConfig['y'] as number) || 0;

    newConfig['x'] = Math.min(11, currentX + 1);
    newConfig['y'] = currentY + 1;

    const payload: WidgetCreateSql = {
      title: `Copy of ${source.title}`,
      type: 'SQL',
      visualization: source.visualization,
      config: newConfig as any,
    };

    const tempId = `temp-${Date.now()}`;
    const tempWidget: WidgetResponse = {
      id: tempId,
      dashboard_id: dash.id,
      // @ts-ignore
      ...payload,
      type: source.type,
    };

    this.patch({ widgets: [...this.widgets(), tempWidget] });

    this.dashboardApi
      .createWidgetApiV1DashboardsDashboardIdWidgetsPost(dash.id, payload)
      .subscribe({
        next: (realWidget: WidgetResponse) => {
          const updatedWidgets = this.widgets().map((w) => (w.id === tempId ? realWidget : w));
          this.patch({ widgets: updatedWidgets });
          this.refreshWidget(realWidget.id);
        },
        error: (err) => {
          this.handleError(err);
          this.optimisticRemoveWidget(tempId);
        },
      });
  }

  createDefaultDashboard(): void {
    this.patch({ isLoading: true, error: null });
    this.dashboardApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost().subscribe({
      next: (newDash: DashboardResponse) => {
        this.router.navigate(['/dashboard', newDash.id]).then(() => {
          this.patch({ isLoading: false });
        });
      },
      error: (err) => {
        this.handleError(err);
        this.patch({ isLoading: false });
      },
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

    const hasChanged =
      keysA.length !== keysB.length || keysB.some((key) => current[key] !== params[key]);

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

    const sorted = [...this.sortedWidgets()];
    const [movedWidget] = sorted.splice(previousIndex, 1);
    sorted.splice(currentIndex, 0, movedWidget);

    const updates: WidgetReorderItem[] = [];
    const updatedWidgets = sorted.map((w, index) => {
      const newConfig: Record<string, any> = { ...w.config, order: index };
      delete newConfig['group'];

      updates.push({ id: w.id, order: index, group: 'General' });
      return { ...w, config: newConfig };
    });

    this.patch({ widgets: updatedWidgets });

    const request: WidgetReorderRequest = { items: updates };
    this.dashboardApi
      .reorderWidgetsApiV1DashboardsDashboardIdReorderPost(currentDashboard.id, request)
      .subscribe({
        error: (e) => {
          this.handleError(e);
          this.loadDashboard(currentDashboard.id);
        },
      });
  }

  optimisticRemoveWidget(id: string): void {
    const current = this._state().widgets;
    this.patch({ widgets: current.filter((w) => w.id !== id) });
  }

  optimisticRestoreWidget(widget: WidgetResponse): void {
    const current = this._state().widgets;
    this.patch({ widgets: [...current, widget] });
  }

  private patch(p: Partial<DashboardState>) {
    this._state.update((current) => ({ ...current, ...p }));
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
