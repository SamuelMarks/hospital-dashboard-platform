import { TestBed } from '@angular/core/testing';
import { DashboardStore } from './dashboard.store';
import {
  DashboardsService,
  ExecutionService,
  DashboardResponse,
  WidgetResponse,
} from '../api-client';
import { of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { vi } from 'vitest';

describe('DashboardStore', () => {
  let store: DashboardStore;
  let mockExecApi: {
    refreshDashboardApiV1DashboardsDashboardIdRefreshPost: ReturnType<typeof vi.fn>;
  };
  let mockDashApi: {
    getDashboardApiV1DashboardsDashboardIdGet: ReturnType<typeof vi.fn>;
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
    restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: ReturnType<typeof vi.fn>;
    reorderWidgetsApiV1DashboardsDashboardIdReorderPost: ReturnType<typeof vi.fn>;
    createWidgetApiV1DashboardsDashboardIdWidgetsPost: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  const makeWidget = (overrides: Partial<WidgetResponse> = {}): WidgetResponse => ({
    id: 'w1',
    dashboard_id: 'd1',
    title: 'Widget',
    type: 'SQL',
    visualization: 'table',
    config: {},
    ...overrides,
  });

  const makeDashboard = (overrides: Partial<DashboardResponse> = {}): DashboardResponse => ({
    id: 'd1',
    name: 'Test',
    owner_id: 'u1',
    widgets: [],
    ...overrides,
  });

  const d1 = makeDashboard();

  beforeEach(() => {
    vi.useFakeTimers();

    mockDashApi = {
      getDashboardApiV1DashboardsDashboardIdGet: vi.fn(),
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn(),
      restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: vi.fn(),
      reorderWidgetsApiV1DashboardsDashboardIdReorderPost: vi.fn(),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
    };
    mockExecApi = {
      refreshDashboardApiV1DashboardsDashboardIdRefreshPost: vi.fn(),
    };
    mockRouter = {
      navigate: vi.fn().mockReturnValue(Promise.resolve(true)),
    };

    // Default return to prevent pipe crash
    mockExecApi.refreshDashboardApiV1DashboardsDashboardIdRefreshPost.mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        DashboardStore,
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ExecutionService, useValue: mockExecApi },
        { provide: Router, useValue: mockRouter },
      ],
    });

    store = TestBed.inject(DashboardStore);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ... (previous tests unchanged)

  it('should log repair failures when auto-fix update fails', () => {
    const brokenWidget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_ID FROM t' },
    });
    const dash = makeDashboard({ widgets: [brokenWidget] });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    store.loadDashboard('d1');

    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should heal broken widgets when loading dashboard', () => {
    const brokenWidget = makeWidget({
      id: 'w1',
      title: 'Widget Admission Lag',
      config: { query: 'SELECT Visit_ID FROM t' },
    });
    const dash = makeDashboard({ widgets: [brokenWidget] });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockDashApi.getDashboardApiV1DashboardsDashboardIdGet.mockReturnValue(of(dash));
    mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut.mockReturnValue(of({}));

    store.loadDashboard('d1');

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // ... (rest of tests unchanged)
});
