/**
 * @fileoverview Unit tests for ToolbarComponent.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ToolbarComponent } from './toolbar.component';
import { DashboardStore } from './dashboard.store';
import { AskDataService } from '../global/ask-data.service';
import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/theme/theme.service';
import { DashboardsService, DashboardResponse } from '../api-client';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { signal, WritableSignal, NO_ERRORS_SCHEMA } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute, Event as RouterEvent } from '@angular/router';
import { vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import { QueryCartService } from '../global/query-cart.service';
import { readTemplate } from '../../test-utils/component-resources';
import { createMockInputEvent } from '../../test-utils/mock-factories';
import { CollaboratorPresenceComponent } from './collaborator-presence/collaborator-presence.component';
import { UndoRedoButtonsComponent } from '../shared/components/undo-redo-buttons.component';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({
    schemes: {
      light: new Proxy({}, { get: () => 0xffffffff }),
      dark: new Proxy({}, { get: () => 0xffffffff }),
    },
  }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

describe('ToolbarComponent', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;
  let mockSnackBar: { open: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockAuthService: {
    currentUser: WritableSignal<Record<string, unknown>>;
    logout: ReturnType<typeof vi.fn>;
  };
  let mockThemeService: {
    isDark: WritableSignal<boolean>;
    seedColor: WritableSignal<string>;
    toggle: ReturnType<typeof vi.fn>;
    setSeedColor: ReturnType<typeof vi.fn>;
  };
  let routerEvents$: Subject<RouterEvent>;
  let mockStore: {
    dashboard: WritableSignal<Partial<DashboardResponse> | null>;
    isLoading: WritableSignal<boolean>;
    isEditMode: WritableSignal<boolean>;
    refreshAll: ReturnType<typeof vi.fn>;
    loadDashboard: ReturnType<typeof vi.fn>;
    toggleEditMode: ReturnType<typeof vi.fn>;
  };
  let mockRouter: {
    events: ReturnType<Subject<RouterEvent>['asObservable']>;
    url: string;
    navigate: ReturnType<typeof vi.fn>;
    createUrlTree: ReturnType<typeof vi.fn>;
    serializeUrl: ReturnType<typeof vi.fn>;
  };
  let mockHttp: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockHttp = {
      get: vi.fn(),
    };

    mockStore = {
      dashboard: signal(null),
      isLoading: signal(false),
      isEditMode: signal(false),
      refreshAll: vi.fn(),
      loadDashboard: vi.fn(),
      toggleEditMode: vi.fn(),
    };

    const snackRefMock = {
      onAction: vi.fn().mockReturnValue(of(undefined)),
    };

    mockSnackBar = {
      open: vi.fn().mockReturnValue(snackRefMock),
    };
    mockDialog = {
      open: vi.fn(),
    };
    mockAuthService = {
      currentUser: signal({}),
      logout: vi.fn(),
    };
    mockThemeService = {
      isDark: signal(false),
      seedColor: signal(''),
      toggle: vi.fn(),
      setSeedColor: vi.fn(),
    };

    routerEvents$ = new Subject();
    mockRouter = {
      events: routerEvents$.asObservable(),
      url: '/',
      navigate: vi.fn(),
      createUrlTree: vi.fn().mockReturnValue({}),
      serializeUrl: vi.fn().mockReturnValue('/'),
    };

    await TestBed.configureTestingModule({
      imports: [ToolbarComponent],
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: {} },
        { provide: AskDataService, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: QueryCartService, useValue: { count: signal(0) } },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: HttpClient, useValue: mockHttp },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { snapshot: {}, params: of({}) } },
      ],
    })
      .overrideProvider(MatSnackBar, { useValue: mockSnackBar })
      .overrideComponent(ToolbarComponent, {
        remove: { imports: [CollaboratorPresenceComponent, UndoRedoButtonsComponent] },
      })
      .overrideComponent(ToolbarComponent, {
        set: {
          template: readTemplate('./toolbar.component.html'),
          templateUrl: undefined,
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should show hint when opening cart off dashboard', async () => {
    mockStore.dashboard.set(null);
    mockRouter.url = '/home';

    routerEvents$.next(new NavigationEnd(1, '/home', '/home'));

    fixture.detectChanges();
    await fixture.whenStable();

    component.openCart();

    expect(mockStore.toggleEditMode).not.toHaveBeenCalled();

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringContaining('Open a dashboard'),
      'Go to Home',
      expect.objectContaining({ duration: 4000 }),
    );
  });

  it('should toggle edit mode when opening cart ON dashboard', async () => {
    const dash = { id: 'd1', name: 'Dash' };
    mockStore.dashboard.set(dash);
    mockRouter.url = '/dashboard/d1';
    routerEvents$.next(new NavigationEnd(1, '/dashboard/d1', '/dashboard/d1'));

    fixture.detectChanges();
    await fixture.whenStable();

    component.openCart();

    expect(mockStore.toggleEditMode).toHaveBeenCalled();
    expect(mockSnackBar.open).not.toHaveBeenCalled();
  });

  it('should do nothing when opening cart on dashboard if edit mode is already true', async () => {
    const dash = { id: 'd1', name: 'Dash' };
    mockStore.dashboard.set(dash);
    mockStore.isEditMode.set(true);
    mockRouter.url = '/dashboard/d1';
    routerEvents$.next(new NavigationEnd(1, '/dashboard/d1', '/dashboard/d1'));

    fixture.detectChanges();
    await fixture.whenStable();

    component.openCart();

    expect(mockStore.toggleEditMode).not.toHaveBeenCalled();
  });

  it('should logout via auth service', () => {
    component.logout();
    expect(mockAuthService.logout).toHaveBeenCalled();
  });

  it('should update theme color', () => {
    component.updateTheme('#ff0000');
    expect(mockThemeService.setSeedColor).toHaveBeenCalledWith('#ff0000');
  });

  it('should handle color picker changes', () => {
    component.onColorPickerChange(createMockInputEvent('#00ff00'));
    expect(mockThemeService.setSeedColor).toHaveBeenCalledWith('#00ff00');
  });

  it('should ignore empty color picker changes', () => {
    component.onColorPickerChange(createMockInputEvent(''));
    expect(mockThemeService.setSeedColor).not.toHaveBeenCalled();
  });

  it('should open widget builder dialog', () => {
    const dash = { id: 'd1' };
    mockStore.dashboard.set(dash);
    mockDialog.open.mockReturnValue({
      afterClosed: () => of(true),
    });

    component.openWidgetBuilder();

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should open widget builder dialog but not load dashboard if false is returned', () => {
    const dash = { id: 'd1' };
    mockStore.dashboard.set(dash);
    mockDialog.open.mockReturnValue({
      afterClosed: () => of(false),
    });

    component.openWidgetBuilder();

    expect(mockDialog.open).toHaveBeenCalled();
    expect(mockStore.loadDashboard).not.toHaveBeenCalled();
  });

  it('should not open widget builder if dashboard missing', () => {
    mockStore.dashboard.set(null);

    component.openWidgetBuilder();
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('should download authorized blob stream for csv, json, and pdf exports', () => {
    const createUrlSpy = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:test-url');
    const revokeUrlSpy = vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});
    const mockBlob = new Blob(['test data'], { type: 'text/csv' });
    mockHttp.get.mockReturnValue(of(mockBlob));

    mockStore.dashboard.set({ id: 'd123', name: 'Clinical Overview' });

    component.exportDashboard('csv');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/dashboards/d123/export?format=csv', {
      responseType: 'blob',
    });
    expect(createUrlSpy).toHaveBeenCalledWith(mockBlob);
    expect(revokeUrlSpy).toHaveBeenCalledWith('blob:test-url');

    component.exportDashboard('json');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/dashboards/d123/export?format=json', {
      responseType: 'blob',
    });

    component.exportDashboard('pdf');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/dashboards/d123/export/pdf', {
      responseType: 'blob',
    });

    mockStore.dashboard.set({ id: 'd123', name: '' });
    component.exportDashboard('csv');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/dashboards/d123/export?format=csv', {
      responseType: 'blob',
    });

    mockStore.dashboard.set(null);
    component.exportDashboard('csv');
    expect(mockHttp.get).toHaveBeenCalledTimes(4);

    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
  });

  it('should display snackbar error on export HTTP failure', () => {
    mockHttp.get.mockReturnValue(throwError(() => new Error('Export failed')));
    mockStore.dashboard.set({ id: 'd123', name: 'Clinical Overview' });

    component.exportDashboard('pdf');

    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Failed to export dashboard. Please try again.',
      'Dismiss',
      { duration: 4000 },
    );
  });

  it('should open share dialog when openShareDialog is called', () => {
    const dash = { id: 'd1', name: 'Clinical Ops' };
    mockStore.dashboard.set(dash);

    component.openShareDialog();

    expect(mockDialog.open).toHaveBeenCalled();

    mockStore.dashboard.set(null);
    component.openShareDialog();
    expect(mockDialog.open).toHaveBeenCalledTimes(1);
  });

  it('should open theme dialog when openThemeDialog is called', () => {
    const dash = { id: 'd1', name: 'Clinical Ops' };
    mockStore.dashboard.set(dash);

    component.openThemeDialog();

    expect(mockDialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          dashboardId: 'd1',
          dashboardName: 'Clinical Ops',
        }) as unknown,
      }),
    );

    mockStore.dashboard.set(null);
    component.openThemeDialog();
    expect(mockDialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          dashboardId: '',
          dashboardName: 'Dashboard',
        }) as unknown,
      }),
    );
  });

  it('should compute refreshAriaLabel and format getColorAriaLabel', () => {
    mockStore.isLoading.set(false);
    expect(component.refreshAriaLabel()).toBe('Refresh Dashboard');
    mockStore.isLoading.set(true);
    expect(component.refreshAriaLabel()).toBe('Refreshing Data');
    expect(component.getColorAriaLabel('#1565c0')).toBe('Set theme color to Ocean Blue');
    expect(component.getColorAriaLabel('#123456')).toBe('Set theme color to #123456');
  });
});
