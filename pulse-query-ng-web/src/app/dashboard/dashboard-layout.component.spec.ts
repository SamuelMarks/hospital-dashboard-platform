/**
 * @fileoverview Unit tests for `DashboardLayoutComponent`.
 */

import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { signal, WritableSignal } from '@angular/core';
import { DashboardLayoutComponent } from './dashboard-layout.component';
import { DashboardStore } from './dashboard.store';
import { DashboardsService, TemplateResponse, WidgetResponse } from '../api-client';
import { ProvisioningService } from './provisioning.service';
import { QueryCartProvisioningService } from './query-cart-provisioning.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ThemeService } from '../core/theme/theme.service';
import { ActivatedRoute } from '@angular/router';
import { QUERY_CART_ITEM_KIND, type QueryCartItem } from '../global/query-cart.models';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';
import { DashboardCollaborationService } from '../core/collaboration/dashboard-collaboration.service';
import { vi } from 'vitest';

const makeCartItem = (): QueryCartItem => ({
  id: 'q1',
  title: 'Cart Query',
  sql: 'SELECT 1',
  createdAt: '2024-01-01T00:00:00Z',
  kind: QUERY_CART_ITEM_KIND,
});

const makeTemplate = (): TemplateResponse => ({
  id: 't1',
  title: 'Template A',
  category: 'Clinical',
  description: 'desc',
  sql_template: 'SELECT 1',
  parameters_schema: {},
});

const makeWidget = (overrides: Partial<WidgetResponse> = {}): WidgetResponse => ({
  id: 'w1',
  dashboard_id: 'd1',
  title: 'Widget',
  type: 'SQL',
  visualization: 'table',
  config: { w: 6, h: 3 },
  ...overrides,
});

describe('DashboardLayoutComponent', () => {
  let mockStore: {
    dashboard: WritableSignal<{ id: string } | null>;
    isEditMode: WritableSignal<boolean>;
    sortedWidgets: WritableSignal<WidgetResponse[]>;
    reset: ReturnType<typeof vi.fn>;
    loadDashboard: ReturnType<typeof vi.fn>;
    refreshWidget: ReturnType<typeof vi.fn>;
    setGlobalParams: ReturnType<typeof vi.fn>;
    updateWidgetOrder: ReturnType<typeof vi.fn>;
    setLoading: ReturnType<typeof vi.fn>;
    setFocusedWidget: ReturnType<typeof vi.fn>;
    optimisticRemoveWidget: ReturnType<typeof vi.fn>;
    optimisticRestoreWidget: ReturnType<typeof vi.fn>;
  };
  let mockDashApi: {
    updateWidgetApiV1DashboardsWidgetsWidgetIdPut: ReturnType<typeof vi.fn>;
    deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: ReturnType<typeof vi.fn>;
  };
  let mockProvisioning: { provisionWidget: ReturnType<typeof vi.fn> };
  let mockCartProvisioning: { addToDashboard: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };
  let mockTheme: { isTvMode: WritableSignal<boolean> };
  let mockCollab: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    remoteWidgetUpdates$: ReturnType<Subject<string>['asObservable']>;
  };
  let remoteWidgetUpdates$: Subject<string>;
  let paramMap$: Subject<{ get: (key: string) => string | null }>;
  let queryParamMap$: Subject<{ keys: string[]; get: (key: string) => string | null }>;

  const setup = (): DashboardLayoutComponent =>
    TestBed.runInInjectionContext(() => new DashboardLayoutComponent());

  beforeEach(() => {
    paramMap$ = new Subject<{ get: (key: string) => string | null }>();
    queryParamMap$ = new Subject<{ keys: string[]; get: (key: string) => string | null }>();
    remoteWidgetUpdates$ = new Subject<string>();

    mockStore = {
      dashboard: signal({ id: 'd1' }),
      isEditMode: signal(true),
      sortedWidgets: signal([makeWidget({ id: 'w1' }), makeWidget({ id: 'w2' })]),
      reset: vi.fn(),
      loadDashboard: vi.fn(),
      refreshWidget: vi.fn(),
      setGlobalParams: vi.fn(),
      updateWidgetOrder: vi.fn(),
      setLoading: vi.fn(),
      setFocusedWidget: vi.fn(),
      optimisticRemoveWidget: vi.fn(),
      optimisticRestoreWidget: vi.fn(),
    };
    mockDashApi = {
      updateWidgetApiV1DashboardsWidgetsWidgetIdPut: vi.fn().mockReturnValue(of({})),
      deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn().mockReturnValue(of({})),
    };
    mockProvisioning = { provisionWidget: vi.fn() };
    mockCartProvisioning = { addToDashboard: vi.fn() };
    mockDialog = { open: vi.fn() };
    mockSnackBar = { open: vi.fn() };
    mockTheme = { isTvMode: signal(false) };
    mockCollab = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      remoteWidgetUpdates$: remoteWidgetUpdates$.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ProvisioningService, useValue: mockProvisioning },
        { provide: QueryCartProvisioningService, useValue: mockCartProvisioning },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: ThemeService, useValue: mockTheme },
        { provide: DashboardCollaborationService, useValue: mockCollab },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
      ],
    });
  });

  it('should load dashboard and params on init', () => {
    const component = setup();
    component.ngOnInit();

    paramMap$.next({ get: (key: string) => (key === 'id' ? 'd9' : null) });
    queryParamMap$.next({
      keys: ['dept', 'mode'],
      get: (key: string) => (key === 'dept' ? 'Cardiology' : 'tv'),
    });

    expect(mockStore.reset).toHaveBeenCalled();
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d9');
    expect(mockCollab.connect).toHaveBeenCalledWith('d9');
    expect(mockStore.setGlobalParams).toHaveBeenCalledWith({ dept: 'Cardiology' });

    remoteWidgetUpdates$.next('widget-42');
    expect(mockStore.refreshWidget).toHaveBeenCalledWith('widget-42');

    component.ngOnDestroy();
    expect(mockCollab.disconnect).toHaveBeenCalled();
  });

  it('should skip loading when route id is missing', () => {
    const component = setup();
    component.ngOnInit();

    paramMap$.next({ get: () => null });

    expect(mockStore.loadDashboard).not.toHaveBeenCalled();
  });

  it('should no-op drop in TV mode', () => {
    const component = setup();
    mockTheme.isTvMode.set(true);

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: makeCartItem() },
      previousIndex: 0,
      currentIndex: 0,
    });

    expect(mockStore.updateWidgetOrder).not.toHaveBeenCalled();
    expect(mockCartProvisioning.addToDashboard).not.toHaveBeenCalled();
  });

  it('should reorder when dropped within same container', () => {
    const component = setup();
    const container = {};

    component.onDrop({
      previousContainer: container,
      container,
      previousIndex: 1,
      currentIndex: 2,
    });

    expect(mockStore.updateWidgetOrder).toHaveBeenCalledWith(1, 2);
  });

  it('should return early when dashboard is missing', () => {
    const component = setup();
    mockStore.dashboard.set(null);

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: makeTemplate() },
      previousIndex: 0,
      currentIndex: 0,
    });

    expect(mockProvisioning.provisionWidget).not.toHaveBeenCalled();
  });

  it('should return early when drop data is missing', () => {
    const component = setup();

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: null },
      previousIndex: 0,
      currentIndex: 0,
    });

    expect(mockProvisioning.provisionWidget).not.toHaveBeenCalled();
    expect(mockCartProvisioning.addToDashboard).not.toHaveBeenCalled();
  });

  it('should provision query cart items on drop', () => {
    const component = setup();
    const item = makeCartItem();
    mockCartProvisioning.addToDashboard.mockReturnValue(of({ id: 'w1' }));

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: item },
      previousIndex: 0,
      currentIndex: 0,
    });

    expect(mockStore.setLoading).toHaveBeenCalledWith(true);
    expect(mockCartProvisioning.addToDashboard).toHaveBeenCalledWith(item, 'd1');
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      `Added query: ${item.title}`,
      'OK',
      expect.anything(),
    );
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should handle errors when cart provisioning fails', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const component = setup();
    const item = makeCartItem();
    mockCartProvisioning.addToDashboard.mockReturnValue(throwError(() => new Error('fail')));

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: item },
      previousIndex: 0,
      currentIndex: 0,
    });

    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to add query to dashboard', 'Close');
    expect(mockStore.setLoading).toHaveBeenCalledWith(false);

    consoleSpy.mockRestore();
  });

  it('should provision template widgets on drop', () => {
    const component = setup();
    const template = makeTemplate();
    mockProvisioning.provisionWidget.mockReturnValue(of({ id: 'w2' }));

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: template },
      previousIndex: 0,
      currentIndex: 0,
    });

    expect(mockProvisioning.provisionWidget).toHaveBeenCalledWith(template, 'd1');
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      `Added widget: ${template.title}`,
      'OK',
      expect.anything(),
    );
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should handle template provisioning errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const component = setup();
    const template = makeTemplate();
    mockProvisioning.provisionWidget.mockReturnValue(throwError(() => new Error('fail')));

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: template },
      previousIndex: 0,
      currentIndex: 0,
    });

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Failed to create widget from template',
      'Close',
    );
    expect(mockStore.setLoading).toHaveBeenCalledWith(false);

    consoleSpy.mockRestore();
  });

  it('should identify query cart drag data', () => {
    const component = setup();
    expect(component.isQueryCartItem(null)).toBe(false);
    expect(component.isQueryCartItem('bad')).toBe(false);
    expect(component.isQueryCartItem(makeTemplate())).toBe(false);
    expect(component.isQueryCartItem(makeCartItem())).toBe(true);
  });

  it('should compute column and row spans', () => {
    const component = setup();
    expect(component.getColSpan(makeWidget({ config: { w: 2 } }))).toBe(2);
    expect(component.getColSpan(makeWidget({ config: { w: 20 } }))).toBe(12);
    expect(component.getColSpan(makeWidget({ config: {} }))).toBe(6);
    expect(component.getRowSpan(makeWidget({ config: { h: 1 } }))).toBe(1);
    expect(component.getRowSpan(makeWidget({ config: { h: 10 } }))).toBe(4);
    expect(component.getRowSpan(makeWidget({ config: {} }))).toBe(2);
  });

  it('should return early from startResizing in TV mode', () => {
    const component = setup();
    mockTheme.isTvMode.set(true);
    const spy = vi.spyOn(component, 'updateWidgetWidth');

    const detached = document.createElement('div');
    const event = new MouseEvent('mousedown', { clientX: 0 });
    Object.defineProperty(event, 'target', { value: detached });
    component.startResizing(event, makeWidget());

    expect(spy).not.toHaveBeenCalled();
  });

  it('should return early from startResizing when no container', () => {
    const component = setup();
    const spy = vi.spyOn(component, 'updateWidgetWidth');

    const detached = document.createElement('div');
    const event = new MouseEvent('mousedown', { clientX: 0 });
    Object.defineProperty(event, 'target', { value: detached });
    component.startResizing(event, makeWidget());

    expect(spy).not.toHaveBeenCalled();
  });

  it('should update widget width when resizing changes columns', () => {
    const component = setup();
    const spy = vi.spyOn(component, 'updateWidgetWidth');

    const grid = document.createElement('div');
    grid.classList.add('dashboard-grid');
    Object.defineProperty(grid, 'clientWidth', { value: 1200 });

    const handle = document.createElement('div');
    grid.appendChild(handle);

    const event = new MouseEvent('mousedown', { clientX: 100 });
    Object.defineProperty(event, 'target', { value: handle });
    component.startResizing(event, makeWidget({ config: { w: 6 } }));

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 300 }));

    expect(spy).toHaveBeenCalledWith(expect.any(Object), 8);
  });

  it('should skip update when resizing does not change columns', () => {
    const component = setup();
    const spy = vi.spyOn(component, 'updateWidgetWidth');

    const grid = document.createElement('div');
    grid.classList.add('dashboard-grid');
    Object.defineProperty(grid, 'clientWidth', { value: 1200 });

    const handle = document.createElement('div');
    grid.appendChild(handle);

    const event = new MouseEvent('mousedown', { clientX: 100 });
    Object.defineProperty(event, 'target', { value: handle });
    component.startResizing(event, makeWidget({ config: { w: 6 } }));

    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 100 }));

    expect(spy).not.toHaveBeenCalled();
  });

  it('should update widget width and reload dashboard', () => {
    const component = setup();
    component.updateWidgetWidth(makeWidget(), 8);

    expect(mockDashApi.updateWidgetApiV1DashboardsWidgetsWidgetIdPut).toHaveBeenCalled();
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should skip reload when dashboard id is missing', () => {
    const component = setup();
    mockStore.dashboard.set(null);
    component.updateWidgetWidth(makeWidget(), 8);

    expect(mockStore.loadDashboard).not.toHaveBeenCalled();
  });

  it('should return early from editWidget in TV mode', () => {
    const component = setup();
    mockTheme.isTvMode.set(true);

    component.editWidget(makeWidget());

    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('should return early from editWidget when dashboard missing', () => {
    const component = setup();
    mockStore.dashboard.set(null);

    component.editWidget(makeWidget());

    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('should open editor dialog and reload on success', () => {
    const component = setup();
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });

    component.editWidget(makeWidget());

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should not reload when editor dialog returns falsy', () => {
    const component = setup();
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });

    component.editWidget(makeWidget());

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockStore.loadDashboard).not.toHaveBeenCalled();
  });

  it('should return early from confirmDeleteWidget in TV mode', () => {
    const component = setup();
    mockTheme.isTvMode.set(true);

    component.confirmDeleteWidget(makeWidget());

    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('should open confirm dialog on delete', () => {
    const component = setup();
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });

    component.confirmDeleteWidget(makeWidget());

    expect(mockDialog.open).toHaveBeenCalledWith(ConfirmDialogComponent, expect.anything());
    expect(mockStore.optimisticRemoveWidget).toHaveBeenCalled();
  });

  it('should return early when delete confirmation is cancelled', () => {
    const component = setup();
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });

    component.confirmDeleteWidget(makeWidget());

    expect(mockStore.optimisticRemoveWidget).not.toHaveBeenCalled();
  });

  it('should restore widget on delete error', () => {
    const component = setup();
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });
    mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    component.confirmDeleteWidget(makeWidget());

    expect(mockStore.optimisticRemoveWidget).toHaveBeenCalledWith('w1');
    expect(mockStore.optimisticRestoreWidget).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should update widget width when resizing via keyboard arrow keys', () => {
    const component = setup();
    const spy = vi.spyOn(component, 'updateWidgetWidth');
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });

    component.resizeByKeyboard(event, makeWidget({ config: { w: 6 } }), 1);
    expect(spy).toHaveBeenCalledWith(expect.any(Object), 7);

    // Clamping at max=12 should not call updateWidgetWidth when already 12
    spy.mockClear();
    component.resizeByKeyboard(event, makeWidget({ config: { w: 12 } }), 1);
    expect(spy).not.toHaveBeenCalled();

    // TV mode no-op
    mockTheme.isTvMode.set(true);
    component.resizeByKeyboard(event, makeWidget({ config: { w: 6 } }), 1);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should reorder widgets via keyboard arrow keys on drag handle', () => {
    const component = setup();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });

    component.reorderByKeyboard(event, 0, 1);
    expect(mockStore.updateWidgetOrder).toHaveBeenCalledWith(0, 1);

    mockStore.updateWidgetOrder.mockClear();
    component.reorderByKeyboard(event, 0, -1);
    expect(mockStore.updateWidgetOrder).not.toHaveBeenCalled();

    mockStore.isEditMode.set(false);
    component.reorderByKeyboard(event, 0, 1);
    expect(mockStore.updateWidgetOrder).not.toHaveBeenCalled();
  });

  it('should close focus overlay when clicking directly on the backdrop', () => {
    const component = setup();
    const overlayEl = document.createElement('div');
    const childEl = document.createElement('div');

    const childClick = new MouseEvent('click');
    Object.defineProperty(childClick, 'target', { value: childEl });
    Object.defineProperty(childClick, 'currentTarget', { value: overlayEl });
    component.onFocusOverlayClick(childClick);
    expect(mockStore.setFocusedWidget).not.toHaveBeenCalled();

    const backdropClick = new MouseEvent('click');
    Object.defineProperty(backdropClick, 'target', { value: overlayEl });
    Object.defineProperty(backdropClick, 'currentTarget', { value: overlayEl });
    component.onFocusOverlayClick(backdropClick);
    expect(mockStore.setFocusedWidget).toHaveBeenCalledWith(null);
  });
});
