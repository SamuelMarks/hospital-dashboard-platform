/**
 * @fileoverview Unit tests for Dashboard Undo/Redo Commands.
 * Verifies execute, undo, and error-handling rollback behavior for
 * ReorderWidgetsCommand, DeleteWidgetCommand, AddWidgetCommand, and UpdateWidgetConfigCommand.
 */

import { of, throwError } from 'rxjs';
import {
  ReorderWidgetsCommand,
  DeleteWidgetCommand,
  AddWidgetCommand,
  UpdateWidgetConfigCommand,
} from './dashboard-commands';
import { WidgetResponse } from '../../api-client';

describe('Dashboard Undo/Redo Commands', () => {
  const mockDate = new Date('2026-01-01T12:00:00Z');

  const createMockWidget = (id: string, title = 'Widget', order = 0): WidgetResponse => ({
    id,
    dashboard_id: 'dash-1',
    title,
    type: 'SQL',
    visualization: 'table',
    config: { order, xKey: 'col_a', yKey: 'col_b' },
  });

  let mockDashboardApi: {
    reorderWidgetsApiV1DashboardsDashboardIdReorderPost: ReturnType<typeof vi.fn>;
    deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
  };

  let mockStore: {
    widgets: ReturnType<typeof vi.fn>;
    setWidgets: ReturnType<typeof vi.fn>;
    optimisticRemoveWidget: ReturnType<typeof vi.fn>;
    optimisticRestoreWidget: ReturnType<typeof vi.fn>;
    loadDashboard: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDashboardApi = {
      reorderWidgetsApiV1DashboardsDashboardIdReorderPost: vi.fn().mockReturnValue(of({})),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})),
    };

    mockStore = {
      widgets: vi.fn().mockReturnValue([]),
      setWidgets: vi.fn(),
      optimisticRemoveWidget: vi.fn(),
      optimisticRestoreWidget: vi.fn(),
      loadDashboard: vi.fn(),
    };
  });

  describe('ReorderWidgetsCommand', () => {
    it('should apply next order on execute and previous order on undo', async () => {
      const prev = [createMockWidget('w1', 'W1', 0), createMockWidget('w2', 'W2', 1)];
      const next = [createMockWidget('w2', 'W2', 0), createMockWidget('w1', 'W1', 1)];

      const cmd = new ReorderWidgetsCommand(
        'dash-1',
        prev,
        next,
        mockDashboardApi as any,
        mockStore as any,
        mockDate,
      );

      expect(cmd.id).toBe(`reorder-${mockDate.getTime()}`);
      expect(cmd.description).toBe('Reorder widgets');
      expect(cmd.timestamp).toEqual(mockDate);

      await cmd.execute();
      expect(mockStore.setWidgets).toHaveBeenCalled();
      expect(
        mockDashboardApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost,
      ).toHaveBeenCalledWith('dash-1', {
        items: [
          { id: 'w2', order: 0, group: 'General' },
          { id: 'w1', order: 1, group: 'General' },
        ],
      });

      await cmd.undo();
      expect(
        mockDashboardApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost,
      ).toHaveBeenCalledWith('dash-1', {
        items: [
          { id: 'w1', order: 0, group: 'General' },
          { id: 'w2', order: 1, group: 'General' },
        ],
      });
    });

    it('should reload dashboard on API reorder error', async () => {
      mockDashboardApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost.mockReturnValue(
        throwError(() => new Error('Reorder failed')),
      );

      const prev = [createMockWidget('w1')];
      const next = [createMockWidget('w1')];

      const cmd = new ReorderWidgetsCommand(
        'dash-1',
        prev,
        next,
        mockDashboardApi as any,
        mockStore as any,
        mockDate,
      );

      await cmd.execute();
      expect(mockStore.loadDashboard).toHaveBeenCalledWith('dash-1');
    });
  });

  describe('DeleteWidgetCommand', () => {
    it('should remove widget on execute and restore widget on undo', async () => {
      const widget = createMockWidget('w1', 'Bed Occupancy');
      const cmd = new DeleteWidgetCommand(
        widget,
        mockDashboardApi as any,
        mockStore as any,
        mockDate,
      );

      expect(cmd.id).toBe(`delete-widget-w1-${mockDate.getTime()}`);
      expect(cmd.description).toBe('Delete widget "Bed Occupancy"');

      await cmd.execute();
      expect(mockStore.optimisticRemoveWidget).toHaveBeenCalledWith('w1');
      expect(
        mockDashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete,
      ).toHaveBeenCalledWith('w1');

      await cmd.undo();
      expect(mockStore.optimisticRestoreWidget).toHaveBeenCalledWith(widget);
    });

    it('should restore widget on delete error', async () => {
      mockDashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(
        throwError(() => new Error('Delete failed')),
      );

      const widget = createMockWidget('w1');
      const cmd = new DeleteWidgetCommand(
        widget,
        mockDashboardApi as any,
        mockStore as any,
        mockDate,
      );

      await cmd.execute();
      expect(mockStore.optimisticRestoreWidget).toHaveBeenCalledWith(widget);
    });
  });

  describe('AddWidgetCommand', () => {
    it('should restore widget on execute and remove widget on undo', async () => {
      const widget = createMockWidget('w2', 'New Chart');
      const cmd = new AddWidgetCommand(widget, mockDashboardApi as any, mockStore as any, mockDate);

      expect(cmd.id).toBe(`add-widget-w2-${mockDate.getTime()}`);
      expect(cmd.description).toBe('Add widget "New Chart"');

      await cmd.execute();
      expect(mockStore.optimisticRestoreWidget).toHaveBeenCalledWith(widget);

      await cmd.undo();
      expect(mockStore.optimisticRemoveWidget).toHaveBeenCalledWith('w2');
      expect(
        mockDashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete,
      ).toHaveBeenCalledWith('w2');
    });

    it('should handle delete error on undo gracefully', async () => {
      mockDashboardApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(
        throwError(() => new Error('Rollback failed')),
      );

      const widget = createMockWidget('w2');
      const cmd = new AddWidgetCommand(widget, mockDashboardApi as any, mockStore as any, mockDate);

      await cmd.undo();
      expect(mockStore.optimisticRestoreWidget).toHaveBeenCalledWith(widget);
    });
  });

  describe('UpdateWidgetConfigCommand', () => {
    it('should apply next config on execute and previous config on undo', async () => {
      const w1 = createMockWidget('w1', 'Original Title');
      const w2 = createMockWidget('w2', 'Other');
      mockStore.widgets.mockReturnValue([w1, w2]);

      const prev = { title: 'Original Title', visualization: 'table', config: { a: 1 } };
      const next = { title: 'Updated Title', visualization: 'bar_chart', config: { a: 2 } };

      const cmd = new UpdateWidgetConfigCommand(
        'w1',
        prev,
        next,
        mockDashboardApi as any,
        mockStore as any,
        mockDate,
      );

      expect(cmd.id).toBe(`update-widget-w1-${mockDate.getTime()}`);
      expect(cmd.description).toBe('Update widget "Updated Title"');

      await cmd.execute();
      expect(mockStore.setWidgets).toHaveBeenCalled();
      expect(mockDashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
        'w1',
        next,
      );

      await cmd.undo();
      expect(mockDashboardApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalledWith(
        'w1',
        prev,
      );
    });
  });
});
