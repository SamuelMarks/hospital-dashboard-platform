import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { ToolbarComponent } from './toolbar.component';
import { DashboardStore } from './dashboard.store';
import { AskDataService } from '../global/ask-data.service';
import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/theme/theme.service';
import { DashboardsService } from '../api-client';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { QueryCartService } from '../global/query-cart.service';

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
  let routerEvents$: Subject<any>;
  let mockStore: any;
  let mockRouter: any;
  let mockHttp: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockHttp = {
      get: vi.fn(),
    };

    // Reset signals and spies
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

    // Assign to the OUTER variable
    mockSnackBar = {
      open: vi.fn().mockReturnValue(snackRefMock),
    };

    routerEvents$ = new Subject();
    mockRouter = {
      events: routerEvents$.asObservable(),
      url: '/',
      navigate: vi.fn(),
      createUrlTree: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ToolbarComponent, NoopAnimationsModule],
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: {} },
        { provide: AskDataService, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: AuthService, useValue: { currentUser: signal({}), logout: vi.fn() } },
        {
          provide: ThemeService,
          useValue: {
            isDark: signal(false),
            seedColor: signal(''),
            toggle: vi.fn(),
            setSeedColor: vi.fn(),
          },
        },
        { provide: QueryCartService, useValue: { count: signal(0) } },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: HttpClient, useValue: mockHttp },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { snapshot: {}, params: of({}) } },
      ],
    })
      // Force override to prevent MatSnackBarModule inside component `imports` silencing mock
      .overrideProvider(MatSnackBar, { useValue: mockSnackBar })
      .overrideComponent(ToolbarComponent, {
        set: { template: '<button data-testid="btn-theme-menu"></button>' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should show hint when opening cart off dashboard', async () => {
    // Arrange: Verify initial state
    mockStore.dashboard.set(null);
    mockRouter.url = '/home'; // manually update mock property accessed by signal

    // Trigger Router Event to update the 'isDashboardRoute' signal
    routerEvents$.next(new NavigationEnd(1, '/home', '/home'));

    fixture.detectChanges();
    await fixture.whenStable();

    // Direct spy target ensures tracking regardless of DI abstraction scopes
    const snackSpy = vi.spyOn(component['snackBar'], 'open').mockReturnValue({
      onAction: () => of(undefined),
    } as any);

    // Act
    component.openCart();

    // Assert
    expect(mockStore.toggleEditMode).not.toHaveBeenCalled();

    expect(snackSpy).toHaveBeenCalledWith(
      expect.stringContaining('Open a dashboard'),
      'Go to Home',
      expect.objectContaining({ duration: 4000 }),
    );
  });

  it('should toggle edit mode when opening cart ON dashboard', async () => {
    // Arrange
    const dash = { id: 'd1', name: 'Dash' };
    mockStore.dashboard.set(dash);
    mockRouter.url = '/dashboard/d1';
    routerEvents$.next(new NavigationEnd(1, '/dashboard/d1', '/dashboard/d1'));

    fixture.detectChanges();
    await fixture.whenStable();

    // Act
    component.openCart();

    // Assert
    const injectedSnackBar = TestBed.inject(MatSnackBar);
    expect(mockStore.toggleEditMode).toHaveBeenCalled();
    expect(injectedSnackBar.open).not.toHaveBeenCalled();
  });

  it('should do nothing when opening cart on dashboard if edit mode is already true', async () => {
    // Arrange
    const dash = { id: 'd1', name: 'Dash' };
    mockStore.dashboard.set(dash);
    mockStore.isEditMode.set(true);
    mockRouter.url = '/dashboard/d1';
    routerEvents$.next(new NavigationEnd(1, '/dashboard/d1', '/dashboard/d1'));

    fixture.detectChanges();
    await fixture.whenStable();

    // Act
    component.openCart();

    // Assert
    expect(mockStore.toggleEditMode).not.toHaveBeenCalled();
  });

  it('should logout via auth service', () => {
    const spy = TestBed.inject(AuthService).logout;
    component.logout();
    expect(spy).toHaveBeenCalled();
  });

  it('should update theme color', () => {
    const spy = TestBed.inject(ThemeService).setSeedColor;
    component.updateTheme('#ff0000');
    expect(spy).toHaveBeenCalledWith('#ff0000');
  });

  it('should handle color picker changes', () => {
    const spy = TestBed.inject(ThemeService).setSeedColor;
    const input = document.createElement('input');
    input.value = '#00ff00';

    component.onColorPickerChange({ target: input } as any);
    expect(spy).toHaveBeenCalledWith('#00ff00');
  });

  it('should ignore empty color picker changes', () => {
    const spy = TestBed.inject(ThemeService).setSeedColor;
    const input = document.createElement('input');
    input.value = '';

    component.onColorPickerChange({ target: input } as any);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should open widget builder dialog', () => {
    const dash = { id: 'd1' };
    mockStore.dashboard.set(dash);
    const dialogSpy = TestBed.inject(MatDialog).open as any;
    dialogSpy.mockReturnValue({ afterClosed: () => of(true) });

    component.openWidgetBuilder();

    expect(dialogSpy).toHaveBeenCalled();
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
  });

  it('should open widget builder dialog but not load dashboard if false is returned', () => {
    const dash = { id: 'd1' };
    mockStore.dashboard.set(dash);
    const dialogSpy = TestBed.inject(MatDialog).open as any;
    dialogSpy.mockReturnValue({ afterClosed: () => of(false) });

    component.openWidgetBuilder();

    expect(dialogSpy).toHaveBeenCalled();
    expect(mockStore.loadDashboard).not.toHaveBeenCalled();
  });

  it('should not open widget builder if dashboard missing', () => {
    mockStore.dashboard.set(null);
    const dialogSpy = TestBed.inject(MatDialog).open;

    component.openWidgetBuilder();
    expect(dialogSpy).not.toHaveBeenCalled();
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

    // Test default fallback filename when name is empty
    mockStore.dashboard.set({ id: 'd123', name: '' });
    component.exportDashboard('csv');
    expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/dashboards/d123/export?format=csv', {
      responseType: 'blob',
    });

    // Early return if no dashboard
    mockStore.dashboard.set(null);
    component.exportDashboard('csv');
    expect(mockHttp.get).toHaveBeenCalledTimes(4);

    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
  });

  it('should display snackbar error on export HTTP failure', () => {
    const { throwError } = require('rxjs');
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
    const dialogSpy = TestBed.inject(MatDialog).open as any;

    component.openShareDialog();

    expect(dialogSpy).toHaveBeenCalled();

    // Early return if no dashboard
    mockStore.dashboard.set(null);
    component.openShareDialog();
    expect(dialogSpy).toHaveBeenCalledTimes(1);
  });

  it('should open theme dialog when openThemeDialog is called', () => {
    const dash = { id: 'd1', name: 'Clinical Ops' };
    mockStore.dashboard.set(dash);
    const dialogSpy = TestBed.inject(MatDialog).open as any;

    component.openThemeDialog();

    expect(dialogSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          dashboardId: 'd1',
          dashboardName: 'Clinical Ops',
        }),
      }),
    );

    // When dashboard is null, should use fallback values
    mockStore.dashboard.set(null);
    component.openThemeDialog();
    expect(dialogSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          dashboardId: '',
          dashboardName: 'Dashboard',
        }),
      }),
    );
  });
});
