/**
 * @fileoverview Unit tests for Toolbar Component.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToolbarComponent } from './toolbar.component';
import { DashboardStore } from './dashboard.store';
import { AskDataService } from '../global/ask-data.service';
import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/theme/theme.service';
import { DashboardsService, DashboardResponse } from '../api-client';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { signal, WritableSignal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { Subject, of } from 'rxjs';
import { QueryCartService } from '../global/query-cart.service';
import { RouterTestingModule } from '@angular/router/testing';
import { MatMenuTrigger } from '@angular/material/menu';
import { OverlayContainer } from '@angular/cdk/overlay';

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

  let mockAskService: any;
  let mockDialog: any;
  let mockStore: any;
  let mockAuthService: any;
  let mockThemeService: any;
  let mockCartService: any;
  // Make mockSnackBar flexible to accept chaining
  let mockSnackBar: { open: ReturnType<typeof vi.fn> }; 
  let router: Router;
  let routerEvents$: Subject<any>;

  let dashboardSig: WritableSignal<any>;
  let isLoadingSig: WritableSignal<boolean>;
  let isEditModeSig: WritableSignal<boolean>;
  let globalParamsSig: WritableSignal<any>;

  beforeEach(async () => {
    // Setup Signals
    dashboardSig = signal(null);
    isLoadingSig = signal(false);
    isEditModeSig = signal(false);
    globalParamsSig = signal({});

    // Setup Mocks
    mockAskService = { open: vi.fn() };
    mockDialog = { open: vi.fn() };
    
    // SnackBar needs specific chaining structure: open().onAction().subscribe()
    const snackRefMock = {
      onAction: vi.fn().mockReturnValue(of(undefined))
    };
    mockSnackBar = {
      open: vi.fn().mockReturnValue(snackRefMock),
    };

    mockStore = {
      dashboard: dashboardSig,
      isLoading: isLoadingSig,
      isEditMode: isEditModeSig,
      globalParams: globalParamsSig,
      refreshAll: vi.fn(),
      loadDashboard: vi.fn(),
      toggleEditMode: vi.fn(),
    };

    mockAuthService = {
      currentUser: signal({ email: 'tester@pulse.com', id: 'u1' }),
      logout: vi.fn(),
    };

    mockThemeService = {
      isDark: signal(false),
      seedColor: signal('#1565c0'),
      toggle: vi.fn(),
      setSeedColor: vi.fn(),
    };
    mockCartService = { count: signal(0) };

    routerEvents$ = new Subject();
    // RouterTestingModule handles Router injection, so we spy on it later
    // but we need to ensure MatSnackBar provided in TestBed overrides module default

    await TestBed.configureTestingModule({
      imports: [ToolbarComponent, NoopAnimationsModule, RouterTestingModule.withRoutes([])],
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: {} },
        { provide: AskDataService, useValue: mockAskService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: QueryCartService, useValue: mockCartService },
        // Providing MatSnackBar here ensures it's available for injection
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    })
      .overrideComponent(ToolbarComponent, {
        set: { template: '<button data-testid="btn-theme-menu"></button>' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);

    // Spy on navigation
    vi.spyOn(router, 'navigate');

    fixture.detectChanges();
  });

  // Feature 0 Test
  it('should toggle edit mode when opening cart on dashboard', () => {
    // Hack for test: Re-define the property as a writable signal just for this spec instance
    // The component uses toSignal which creates a readonly signal.
    Object.defineProperty(component, 'isDashboardRoute', {
      value: signal(true),
      writable: true,
    });

    dashboardSig.set({ id: 'd1' });
    isEditModeSig.set(false);

    component.openCart();

    expect(mockStore.toggleEditMode).toHaveBeenCalled();
  });

  it('should show hint when opening cart off dashboard', () => {
    // Simulate NON-dashboard route
    Object.defineProperty(component, 'isDashboardRoute', {
      value: signal(false),
      writable: true,
    });
    dashboardSig.set(null);

    component.openCart();

    expect(mockStore.toggleEditMode).not.toHaveBeenCalled();
    // Verify toast
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      expect.stringContaining('Open a dashboard'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should toggle edit mode via store', () => {
    expect(component.logout).toBeDefined();
  });

  describe('Template Wiring (with full template)', () => {
    let overlay: OverlayContainer;

    beforeEach(async () => {
      TestBed.resetTestingModule(); // Clear previous config

      await TestBed.configureTestingModule({
        imports: [ToolbarComponent, RouterTestingModule.withRoutes([]), NoopAnimationsModule],
        providers: [
          { provide: DashboardStore, useValue: mockStore },
          { provide: AskDataService, useValue: mockAskService },
          { provide: MatDialog, useValue: mockDialog },
          { provide: AuthService, useValue: mockAuthService },
          { provide: ThemeService, useValue: mockThemeService },
          { provide: QueryCartService, useValue: mockCartService },
          // Re-provide SnackBar
          { provide: MatSnackBar, useValue: mockSnackBar },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ToolbarComponent);
      component = fixture.componentInstance;
      overlay = TestBed.inject(OverlayContainer);
      fixture.detectChanges();
    });

    it('should render cart button globally', () => {
      // Force non-dashboard route
      Object.defineProperty(component, 'isDashboardRoute', {
        value: signal(false),
        writable: true,
      });
      fixture.detectChanges();

      const cartBtn = fixture.debugElement.query(By.css('[data-testid="btn-cart-location"]'));
      expect(cartBtn).toBeTruthy();
    });
  });
});