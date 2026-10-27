/**
 * @fileoverview Unit tests for `DashboardLayoutHistoryService`.
 */

import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { DashboardsService, WidgetResponse } from '../api-client';
import { DashboardCommandStore } from '../core/undo/dashboard-commands';
import { UndoRedoService } from '../core/undo/undo-redo.service';
import { DashboardLayoutHistoryService } from './dashboard-layout-history.service';

describe('DashboardLayoutHistoryService', () => {
  let service: DashboardLayoutHistoryService;
  let undoRedo: UndoRedoService;
  let mockDashApi: {
    reorderWidgetsApiV1DashboardsDashboardIdReorderPost: ReturnType<typeof vi.fn>;
    deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
  };
  let mockStoreBridge: DashboardCommandStore;

  const makeWidget = (id: string, order = 0): WidgetResponse => ({
    id,
    dashboard_id: 'd1',
    title: `Widget ${id}`,
    type: 'SQL',
    visualization: 'table',
    config: { order },
  });

  beforeEach(() => {
    mockDashApi = {
      reorderWidgetsApiV1DashboardsDashboardIdReorderPost: vi.fn().mockReturnValue(of({})),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})),
    };
    mockStoreBridge = {
      widgets: () => [makeWidget('w1', 0), makeWidget('w2', 1)],
      setWidgets: vi.fn(),
      optimisticRemoveWidget: vi.fn(),
      optimisticRestoreWidget: vi.fn(),
      loadDashboard: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        DashboardLayoutHistoryService,
        UndoRedoService,
        { provide: DashboardsService, useValue: mockDashApi },
      ],
    });

    service = TestBed.inject(DashboardLayoutHistoryService);
    undoRedo = TestBed.inject(UndoRedoService);
  });

  it('recordWidgetAddition pushes AddWidgetCommand onto UndoRedoService', () => {
    const execSpy = vi.spyOn(undoRedo, 'execute');
    const widget = makeWidget('w3', 2);
    service.recordWidgetAddition(widget, mockStoreBridge);
    expect(execSpy).toHaveBeenCalledTimes(1);
  });

  it('reorderWidgets validates arguments and executes ReorderWidgetsCommand when valid', () => {
    const widgets = [makeWidget('w1', 0), makeWidget('w2', 1)];

    expect(service.reorderWidgets('', widgets, 0, 1, mockStoreBridge)).toBe(false);
    expect(service.reorderWidgets('d1', widgets, 1, 1, mockStoreBridge)).toBe(false);
    expect(service.reorderWidgets('d1', widgets, 5, 0, mockStoreBridge)).toBe(false);

    const moved = service.reorderWidgets('d1', widgets, 1, 0, mockStoreBridge);
    expect(moved).toBe(true);
    expect(mockStoreBridge.setWidgets).toHaveBeenCalled();
    expect(mockDashApi.reorderWidgetsApiV1DashboardsDashboardIdReorderPost).toHaveBeenCalledWith(
      'd1',
      {
        items: [
          { id: 'w2', order: 0, group: 'General' },
          { id: 'w1', order: 1, group: 'General' },
        ],
      },
    );
  });
});
