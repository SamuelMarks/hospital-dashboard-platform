import { DATE_NOW } from '../core/time.token';
/** @docs */
// pulse-query-ng-web/src/app/dashboard/dashboard.store.ts
import { signal, computed, inject, OnDestroy, Service } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, timer, Subscription } from 'rxjs';
import { switchMap, catchError, takeUntil, tap, filter, finalize } from 'rxjs/operators';
import {
  DashboardsService,
  ExecutionService,
  DashboardResponse,
  WidgetResponse,
  WidgetReorderRequest,
  WidgetReorderItem,
  WidgetCreateSql,
  WidgetCreateHttp,
  WidgetCreateText,
  WidgetIn,
  WidgetUpdate,
} from '../api-client';
import { UndoRedoService } from '../core/undo/undo-redo.service';
import { ReorderWidgetsCommand, AddWidgetCommand } from '../core/undo/dashboard-commands';

/** @docs */
export interface DashboardState {
  dashboard: DashboardResponse | null;
  widgets: WidgetResponse[];
  dataMap: Record<string, unknown>;
  isLoading: boolean;
  loadingWidgetIds: ReadonlySet<string>;
  error: string | null;
  globalParams: Record<string, unknown>;
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

/** @docs */
@Service()
export class DashboardStore implements OnDestroy {
  private readonly dateNow = inject(DATE_NOW);
  private readonly dashboardApi = inject(DashboardsService);
  private readonly executionApi = inject(ExecutionService);
  private readonly router = inject(Router);
  private readonly undoRedoService = inject(UndoRedoService);

  private readonly _state = signal<DashboardState>(initialState);
  private readonly refreshTrigger$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();
  private pollingSub?: Subscription;

  readonly state = this._state.asReadonly();

  readonly dashboard = computed(() => this._state().dashboard);

  readonly widgets = computed(() => this._state().widgets);

  readonly dataMap = computed(() => this._state().dataMap);

  readonly isLoading = computed(() => this._state().isLoading);

  readonly error = computed(() => this._state().error);

  readonly globalParams = computed(() => this._state().globalParams);

  readonly isEditMode = computed(() => this._state().isEditMode);

  readonly focusedWidgetId = computed(() => this._state().focusedWidgetId);

  readonly lastUpdated = computed(() => this._state().lastUpdated);

  readonly sortedWidgets = computed(() => {
    return [...this._state().widgets].sort((a, b) => {
      const orderA = (a.config['order'] as number) || 0;
      const orderB = (b.config['order'] as number) || 0;
      return orderA - orderB;
    });
  });

  readonly isWidgetLoading = computed(() => (id: string) => this._state().loadingWidgetIds.has(id));

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
            .refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
              dash.id,
              undefined,
              undefined,
              undefined,
              params,
            )
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
            dataMap: result as Record<string, unknown>,
            lastUpdated: this.dateNow(),
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
        this.refreshTrigger$.next();
      },
      error: (err) => {
        this.handleError(err);
        this.patch({ isLoading: false });
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

    const newConfig = structuredClone(source.config);
    const currentX = (newConfig['x'] as number) || 0;
    const currentY = (newConfig['y'] as number) || 0;

    newConfig['x'] = Math.min(11, currentX + 1);
    newConfig['y'] = currentY + 1;

    let payload: WidgetIn;
    if (source.type === 'HTTP') {
      payload = {
        title: `Copy of ${source.title}`,
        type: 'HTTP',
        visualization: source.visualization,
        config: newConfig as unknown as WidgetCreateHttp['config'],
      };
    } else if (source.type === 'TEXT') {
      payload = {
        title: `Copy of ${source.title}`,
        type: 'TEXT',
        visualization: 'markdown',
        config: newConfig as unknown as WidgetCreateText['config'],
      };
    } else {
      payload = {
        title: `Copy of ${source.title}`,
        type: 'SQL',
        visualization: source.visualization,
        config: newConfig as unknown as WidgetCreateSql['config'],
      };
    }

    const tempId = `temp-${Date.now()}`;
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
      .subscribe({
        next: (realWidget: WidgetResponse) => {
          const updatedWidgets = this.widgets().map((w) => (w.id === tempId ? realWidget : w));
          this.patch({ widgets: updatedWidgets });
          this.refreshWidget(realWidget.id);
          this.undoRedoService.execute(
            new AddWidgetCommand(realWidget, this.dashboardApi, this, this.dateNow()),
          );
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
            const currentData = { ...this._state().dataMap };
            const widgetPayload = (result as Record<string, unknown>)[widgetId];
            currentData[widgetId] = widgetPayload;
            this.patch({
              dataMap: currentData,
              lastUpdated: this.dateNow(),
            });
          }
        },
        error: (err) => {
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

  reset(): void {
    this.stopPolling();
    this._state.set(initialState);
    this.startPolling();
  }

  updateWidgetOrder(previousIndex: number, currentIndex: number): void {
    const currentDashboard = this.dashboard();
    if (!currentDashboard || previousIndex === currentIndex) return;

    const previousWidgets = [...this.sortedWidgets()];
    const sorted = [...previousWidgets];
    const [movedWidget] = sorted.splice(previousIndex, 1);
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
