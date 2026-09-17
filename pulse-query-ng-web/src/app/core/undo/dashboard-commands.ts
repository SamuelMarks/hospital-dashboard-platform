/**
 * @fileoverview Dashboard Undo/Redo Commands.
 * Defines concrete command classes implementing the Command pattern for
 * undoable actions in the dashboard editor (reordering, adding, deleting, and updating widgets).
 */

import { Command } from './undo-redo.service';
import {
  DashboardsService,
  WidgetResponse,
  WidgetReorderItem,
  WidgetReorderRequest,
  WidgetUpdate,
} from '../../api-client';
import { DashboardStore } from '../../dashboard/dashboard.store';

/**
 * Command for reordering widgets in the active dashboard.
 */
export class ReorderWidgetsCommand implements Command {
  /** Unique command identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Timestamp when created. */
  readonly timestamp: Date;

  /**
   * Constructs a new ReorderWidgetsCommand.
   *
   * @param dashboardId - UUID of the active dashboard.
   * @param previousWidgets - Widget array prior to reordering.
   * @param nextWidgets - Widget array after reordering.
   * @param dashboardApi - Dashboards API client.
   * @param store - Dashboard state management store.
   * @param now - Current date timestamp.
   */
  constructor(
    private readonly dashboardId: string,
    private readonly previousWidgets: WidgetResponse[],
    private readonly nextWidgets: WidgetResponse[],
    private readonly dashboardApi: DashboardsService,
    private readonly store: DashboardStore,
    now: Date,
  ) {
    this.id = `reorder-${now.getTime()}`;
    this.description = 'Reorder widgets';
    this.timestamp = now;
  }

  /**
   * Executes the reorder mutation.
   */
  async execute(): Promise<void> {
    this.applyOrder(this.nextWidgets);
  }

  /**
   * Undoes the reorder mutation by restoring the previous layout order.
   */
  async undo(): Promise<void> {
    this.applyOrder(this.previousWidgets);
  }

  /**
   * Applies the specified widget order to store and remote API.
   *
   * @param widgets - Ordered list of widgets to persist.
   */
  private applyOrder(widgets: WidgetResponse[]): void {
    const updates: WidgetReorderItem[] = [];
    const ordered = widgets.map((w, index) => {
      const newConfig: Record<string, unknown> = { ...w.config, order: index };
      delete newConfig['group'];
      updates.push({ id: w.id, order: index, group: 'General' });
      return { ...w, config: newConfig };
    });

    this.store.setWidgets(ordered);
    const request: WidgetReorderRequest = { items: updates };
    this.dashboardApi
      .reorderWidgetsApiV1DashboardsDashboardIdReorderPost(this.dashboardId, request)
      .subscribe({
        error: () => this.store.loadDashboard(this.dashboardId),
      });
  }
}

/**
 * Command for removing a widget from the active dashboard with undoable restoration.
 */
export class DeleteWidgetCommand implements Command {
  /** Unique command identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Timestamp when created. */
  readonly timestamp: Date;

  /**
   * Constructs a new DeleteWidgetCommand.
   *
   * @param widget - The widget being deleted.
   * @param dashboardApi - Dashboards API client.
   * @param store - Dashboard state management store.
   * @param now - Current date timestamp.
   */
  constructor(
    private readonly widget: WidgetResponse,
    private readonly dashboardApi: DashboardsService,
    private readonly store: DashboardStore,
    now: Date,
  ) {
    this.id = `delete-widget-${widget.id}-${now.getTime()}`;
    this.description = `Delete widget "${widget.title}"`;
    this.timestamp = now;
  }

  /**
   * Executes widget deletion.
   */
  async execute(): Promise<void> {
    this.store.optimisticRemoveWidget(this.widget.id);
    this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(this.widget.id).subscribe({
      error: () => this.store.optimisticRestoreWidget(this.widget),
    });
  }

  /**
   * Undoes widget deletion by restoring it to the store.
   */
  async undo(): Promise<void> {
    this.store.optimisticRestoreWidget(this.widget);
  }
}

/**
 * Command for adding or duplicating a widget in the active dashboard.
 */
export class AddWidgetCommand implements Command {
  /** Unique command identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Timestamp when created. */
  readonly timestamp: Date;

  /**
   * Constructs a new AddWidgetCommand.
   *
   * @param widget - The widget that was created.
   * @param dashboardApi - Dashboards API client.
   * @param store - Dashboard state management store.
   * @param now - Current date timestamp.
   */
  constructor(
    private readonly widget: WidgetResponse,
    private readonly dashboardApi: DashboardsService,
    private readonly store: DashboardStore,
    now: Date,
  ) {
    this.id = `add-widget-${widget.id}-${now.getTime()}`;
    this.description = `Add widget "${widget.title}"`;
    this.timestamp = now;
  }

  /**
   * Executes addition by ensuring the widget exists in the store.
   */
  async execute(): Promise<void> {
    if (!this.store.widgets().some((w) => w.id === this.widget.id)) {
      this.store.optimisticRestoreWidget(this.widget);
    }
  }

  /**
   * Undoes addition by removing the widget.
   */
  async undo(): Promise<void> {
    this.store.optimisticRemoveWidget(this.widget.id);
    this.dashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete(this.widget.id).subscribe({
      error: () => this.store.optimisticRestoreWidget(this.widget),
    });
  }
}

/**
 * Command for updating an existing widget configuration.
 */
export class UpdateWidgetConfigCommand implements Command {
  /** Unique command identifier. */
  readonly id: string;
  /** Human-readable description. */
  readonly description: string;
  /** Timestamp when created. */
  readonly timestamp: Date;

  /**
   * Constructs a new UpdateWidgetConfigCommand.
   *
   * @param widgetId - Target widget ID.
   * @param previous - Previous configuration and visualization snapshot.
   * @param next - New configuration and visualization snapshot.
   * @param dashboardApi - Dashboards API client.
   * @param store - Dashboard state management store.
   * @param now - Current date timestamp.
   */
  constructor(
    private readonly widgetId: string,
    private readonly previous: {
      title: string;
      visualization: string;
      config: Record<string, unknown>;
    },
    private readonly next: {
      title: string;
      visualization: string;
      config: Record<string, unknown>;
    },
    private readonly dashboardApi: DashboardsService,
    private readonly store: DashboardStore,
    now: Date,
  ) {
    this.id = `update-widget-${widgetId}-${now.getTime()}`;
    this.description = `Update widget "${next.title}"`;
    this.timestamp = now;
  }

  /**
   * Executes update with the next configuration.
   */
  async execute(): Promise<void> {
    this.applyUpdate(this.next);
  }

  /**
   * Undoes update by restoring previous configuration.
   */
  async undo(): Promise<void> {
    this.applyUpdate(this.previous);
  }

  /**
   * Applies update payload to store and API.
   *
   * @param target - Configuration target.
   */
  private applyUpdate(target: {
    title: string;
    visualization: string;
    config: Record<string, unknown>;
  }): void {
    const updatePayload: WidgetUpdate = {
      title: target.title,
      visualization: target.visualization,
      config: target.config,
    };

    const current = this.store.widgets();
    const updated = current.map((w) =>
      w.id === this.widgetId
        ? {
            ...w,
            title: target.title,
            visualization: target.visualization,
            config: target.config,
          }
        : w,
    );
    this.store.setWidgets(updated);

    this.dashboardApi
      .updateWidgetApiV1DashboardsWidgetsWidgetIdPut(this.widgetId, updatePayload)
      .subscribe();
  }
}
