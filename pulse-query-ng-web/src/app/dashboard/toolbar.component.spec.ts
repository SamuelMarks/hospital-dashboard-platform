import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  beforeEach(async () => {
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

  it('should not open widget builder if dashboard missing', () => {
    mockStore.dashboard.set(null);
    const dialogSpy = TestBed.inject(MatDialog).open;

    component.openWidgetBuilder();
    expect(dialogSpy).not.toHaveBeenCalled();
  });
});
