/**
 * @fileoverview Service managing undoable dashboard widget layout and creation history commands.
 */

import { Injectable, inject } from '@angular/core';
import { DashboardsService, WidgetResponse } from '../api-client';
import { DATE_NOW } from '../core/time.token';
import {
  AddWidgetCommand,
  DashboardCommandStore,
  ReorderWidgetsCommand,
} from '../core/undo/dashboard-commands';
import { UndoRedoService } from '../core/undo/undo-redo.service';

/**
 * Service encapsulating undo/redo command creation and execution for dashboard layout operations.
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardLayoutHistoryService {
  /** Injected clock factory returning the current `Date`. */
  private readonly dateNow = inject(DATE_NOW);

  /** Generated OpenAPI client for dashboard and widget CRUD operations. */
  private readonly dashboardApi = inject(DashboardsService);

  /** Undo/redo command stack service. */
  private readonly undoRedoService = inject(UndoRedoService);

  /**
   * Records a newly created or duplicated widget on the undo/redo stack.
   *
   * @param widget - Persisted `WidgetResponse` returned by the backend.
   * @param storeBridge - Store bridge providing optimistic remove/restore callbacks.
   */
  recordWidgetAddition(widget: WidgetResponse, storeBridge: DashboardCommandStore): void {
    this.undoRedoService.execute(
      new AddWidgetCommand(widget, this.dashboardApi, storeBridge, this.dateNow()),
    );
  }

  /**
   * Reorders widgets from `previousIndex` to `currentIndex` and pushes a `ReorderWidgetsCommand`
   * onto the undo/redo stack.
   *
   * @param dashboardId - Active dashboard UUID.
   * @param sortedWidgets - Current sorted widgets array.
   * @param previousIndex - Starting index in `sortedWidgets`.
   * @param currentIndex - Destination index in `sortedWidgets`.
   * @param storeBridge - Store bridge providing `setWidgets` and `loadDashboard`.
   * @returns `true` if a reorder command was executed, or `false` if indices were unchanged or out of bounds.
   */
  reorderWidgets(
    dashboardId: string,
    sortedWidgets: WidgetResponse[],
    previousIndex: number,
    currentIndex: number,
    storeBridge: DashboardCommandStore,
  ): boolean {
    if (!dashboardId || previousIndex === currentIndex) {
      return false;
    }

    const previousWidgets = [...sortedWidgets];
    const nextWidgets = [...previousWidgets];
    const [movedWidget] = nextWidgets.splice(previousIndex, 1);
    if (!movedWidget) {
      return false;
    }
    nextWidgets.splice(currentIndex, 0, movedWidget);

    this.undoRedoService.execute(
      new ReorderWidgetsCommand(
        dashboardId,
        previousWidgets,
        nextWidgets,
        this.dashboardApi,
        storeBridge,
        this.dateNow(),
      ),
    );
    return true;
  }
}
