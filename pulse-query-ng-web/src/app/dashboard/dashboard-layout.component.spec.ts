import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { DashboardLayoutComponent } from './dashboard-layout.component';
import { DashboardStore } from './dashboard.store';
import { DashboardsService, TemplateResponse, WidgetResponse } from '../api-client';
import { ProvisioningService } from './provisioning.service';
import { QueryCartProvisioningService } from './query-cart-provisioning.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ThemeService } from '../core/theme/theme.service';
import { ActivatedRoute } from '@angular/router';
import { QueryCartItem } from '../global/query-cart.models';

const makeCartItem = (): QueryCartItem => ({
  id: 'q1',
  title: 'Cart Query',
  sql: 'SELECT 1',
  createdAt: '2024-01-01T00:00:00Z',
  kind: 'query-cart-item',
});

const makeTemplate = (): TemplateResponse =>
  ({
    id: 't1',
    title: 'Template A',
    description: 'desc',
    sql_template: 'SELECT 1',
    parameters_schema: {},
  }) as TemplateResponse;

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
  let mockStore: any;
  let mockDashApi: any;
  let mockProvisioning: any;
  let mockCartProvisioning: any;
  let mockDialog: any;
  let mockSnackBar: any;
  let mockTheme: any;
  let paramMap$: Subject<any>;
  let queryParamMap$: Subject<any>;

  const setup = () => TestBed.runInInjectionContext(() => new DashboardLayoutComponent());

  beforeEach(() => {
    paramMap$ = new Subject<any>();
    queryParamMap$ = new Subject<any>();

    mockStore = {
      dashboard: signal({ id: 'd1' }),
      reset: vi.fn(),
      loadDashboard: vi.fn(),
      setGlobalParams: vi.fn(),
      updateWidgetOrder: vi.fn(),
      setLoading: vi.fn(),
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

    TestBed.configureTestingModule({
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: ProvisioningService, useValue: mockProvisioning },
        { provide: QueryCartProvisioningService, useValue: mockCartProvisioning },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: ThemeService, useValue: mockTheme },
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
    expect(mockStore.setGlobalParams).toHaveBeenCalledWith({ dept: 'Cardiology' });
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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

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
    } as any);

    expect(mockStore.setLoading).toHaveBeenCalledWith(true);
    expect(mockCartProvisioning.addToDashboard).toHaveBeenCalledWith(item, 'd1');
    expect(mockSnackBar.open).toHaveBeenCalledWith('Added query: Cart Query', 'OK', {
      duration: 3000,
    });
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should handle errors when cart provisioning fails', () => {
    const component = setup();
    const item = makeCartItem();
    mockCartProvisioning.addToDashboard.mockReturnValue(throwError(() => new Error('fail')));

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: item },
      previousIndex: 0,
      currentIndex: 0,
    } as any);

    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to add query to dashboard', 'Close');
    expect(mockStore.setLoading).toHaveBeenCalledWith(false);
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
    } as any);

    expect(mockProvisioning.provisionWidget).toHaveBeenCalledWith(template, 'd1');
    expect(mockSnackBar.open).toHaveBeenCalledWith('Added widget: Template A', 'OK', {
      duration: 3000,
    });
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should handle template provisioning errors', () => {
    const component = setup();
    const template = makeTemplate();
    mockProvisioning.provisionWidget.mockReturnValue(throwError(() => new Error('fail')));

    component.onDrop({
      previousContainer: {},
      container: {},
      item: { data: template },
      previousIndex: 0,
      currentIndex: 0,
    } as any);

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Failed to create widget from template',
      'Close',
    );
    expect(mockStore.setLoading).toHaveBeenCalledWith(false);
  });

  it('should identify query cart drag data', () => {
    const component = setup() as any;
    expect(component.isQueryCartItem(null)).toBe(false);
    expect(component.isQueryCartItem('bad')).toBe(false);
    expect(component.isQueryCartItem(makeTemplate())).toBe(false);
    expect(component.isQueryCartItem(makeCartItem())).toBe(true);
  });

  it('should compute column and row spans', () => {
    const component = setup();
    expect(component.getColSpan(makeWidget({ config: { w: 2 } as any }))).toBe(2);
    expect(component.getColSpan(makeWidget({ config: { w: 20 } as any }))).toBe(12);
    expect(component.getColSpan(makeWidget({ config: {} as any }))).toBe(6);
    expect(component.getRowSpan(makeWidget({ config: { h: 1 } as any }))).toBe(1);
    expect(component.getRowSpan(makeWidget({ config: { h: 10 } as any }))).toBe(4);
    expect(component.getRowSpan(makeWidget({ config: {} as any }))).toBe(2);
  });

  it('should return early from startResizing in TV mode', () => {
    const component = setup();
    mockTheme.isTvMode.set(true);
    const spy = vi.spyOn(component, 'updateWidgetWidth');

    component.startResizing(
      {
        clientX: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: { closest: () => null },
      } as any,
      makeWidget(),
    );

    expect(spy).not.toHaveBeenCalled();
  });

  it('should return early from startResizing when no container', () => {
    const component = setup();
    const spy = vi.spyOn(component, 'updateWidgetWidth');

    component.startResizing(
      {
        clientX: 0,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: { closest: () => null },
      } as any,
      makeWidget(),
    );

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

    component.startResizing(
      {
        clientX: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: handle,
      } as any,
      makeWidget({ config: { w: 6 } as any }),
    );

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

    component.startResizing(
      {
        clientX: 100,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: handle,
      } as any,
      makeWidget({ config: { w: 6 } as any }),
    );

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

    expect(mockStore.optimisticRemoveWidget).not.toHaveBeenCalled();
  });

  it('should return early when delete confirmation is cancelled', () => {
    const component = setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.confirmDeleteWidget(makeWidget());

    expect(mockStore.optimisticRemoveWidget).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('should restore widget on delete error', () => {
    const component = setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDashApi.deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    component.confirmDeleteWidget(makeWidget());

    expect(mockStore.optimisticRemoveWidget).toHaveBeenCalledWith('w1');
    expect(mockStore.optimisticRestoreWidget).toHaveBeenCalledWith(expect.any(Object));
    confirmSpy.mockRestore();
  });
});
