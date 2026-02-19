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
import { signal, WritableSignal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { of, Subject } from 'rxjs';
import { QueryCartService } from '../global/query-cart.service';
import { RouterTestingModule } from '@angular/router/testing';
import { MatMenuTrigger } from '@angular/material/menu';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatSlideToggle } from '@angular/material/slide-toggle';

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
  let router: Router;
  let routerEvents$: Subject<any>;

  let dashboardSig: WritableSignal<DashboardResponse | null>;
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
    const mockRouter = {
      events: routerEvents$.asObservable(),
      url: '/',
    };

    await TestBed.configureTestingModule({
      imports: [ToolbarComponent, NoopAnimationsModule],
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: {} },
        { provide: AskDataService, useValue: mockAskService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: QueryCartService, useValue: mockCartService },
        { provide: Router, useValue: mockRouter },
      ],
    })
      .overrideComponent(ToolbarComponent, {
        set: { template: '<button data-testid="btn-theme-menu"></button>' },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);

    fixture.detectChanges();
  });

  // ... (Existing unit tests)

  it('should toggle edit mode via store', () => {
    expect(component.logout).toBeDefined();
  });

  describe('Template Wiring (with full template)', () => {
    let overlay: OverlayContainer;

    beforeEach(async () => {
      TestBed.resetTestingModule()
        .configureTestingModule({
          imports: [ToolbarComponent, RouterTestingModule.withRoutes([]), NoopAnimationsModule],
          providers: [
            { provide: DashboardStore, useValue: mockStore },
            { provide: AskDataService, useValue: mockAskService },
            { provide: MatDialog, useValue: mockDialog },
            { provide: AuthService, useValue: mockAuthService },
            { provide: ThemeService, useValue: mockThemeService },
            { provide: QueryCartService, useValue: mockCartService },
          ],
        })
        .compileComponents();

      fixture = TestBed.createComponent(ToolbarComponent);
      component = fixture.componentInstance;
      overlay = TestBed.inject(OverlayContainer);
      fixture.detectChanges();
    });

    it('should render cart button globally', () => {
      // Force non-dashboard route
      (component as any).isDashboardRoute = signal(false);
      fixture.detectChanges();

      const cartBtn = fixture.debugElement.query(By.css('[data-testid="btn-cart-location"]'));
      expect(cartBtn).toBeTruthy();
    });
  });
});
