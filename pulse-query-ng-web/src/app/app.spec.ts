/**
 * @fileoverview Unit tests for the App Root Component.
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, PLATFORM_ID, signal, WritableSignal } from '@angular/core';
import { RouterOutlet, provideRouter, ActivatedRoute } from '@angular/router';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { App } from './app';
import { AskDataComponent } from './global/ask-data.component';
import { AskDataService } from './global/ask-data.service';
import { ThemeService } from './core/theme/theme.service';
import { ToolbarComponent } from './dashboard/toolbar.component';
import { DashboardsService } from './api-client';
import { QueryCartService } from './global/query-cart.service';
import { AuthService } from './core/auth/auth.service';
import { DashboardStore } from './dashboard/dashboard.store';
import { MatDialog } from '@angular/material/dialog';
import { vi } from 'vitest';
import { Subject, of } from 'rxjs';
import { resolveComponentResourcesForTests } from '../test-utils/component-resources';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xffffffff,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true,
}));

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let component: App;
  let queryParams$: Subject<Record<string, any>>;

  let mockThemeService: any;
  let mockDashboardsService: any;
  let mockCartService: any;
  let mockAuthService: any;
  let mockDashboardStore: any;
  let mockDialog: any;
  let mockAskDataService: any;

  beforeEach(async () => {
    // Force resolving resources because lazy chunks might trigger loader in JSDOM
    await resolveComponentResourcesForTests();

    mockAskDataService = { isOpen: signal(false), close: vi.fn() };
    mockDashboardsService = {
      listDashboardsApiV1DashboardsGet: vi.fn(),
      createDashboardApiV1DashboardsPost: vi.fn(),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn(),
    };
    mockCartService = { count: signal(0), add: vi.fn() };
    mockAuthService = {
      currentUser: signal({ email: 'test@example.com' }),
      isAuthenticated: signal(false),
      logout: vi.fn(),
    };
    mockDashboardStore = {
      dashboard: signal(null),
      isEditMode: signal(false),
      toggleEditMode: vi.fn(),
      refreshAll: vi.fn(),
      isLoading: signal(false),
      loadDashboard: vi.fn(),
    };
    mockDialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(false) }) };
    queryParams$ = new Subject<Record<string, any>>();
    mockThemeService = { isTvMode: signal(false), setTvMode: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [App, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        { provide: AskDataService, useValue: mockAskDataService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: DashboardsService, useValue: mockDashboardsService },
        { provide: QueryCartService, useValue: mockCartService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: DashboardStore, useValue: mockDashboardStore },
        { provide: MatDialog, useValue: mockDialog },
        { provide: PLATFORM_ID, useValue: 'server' },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams: queryParams$.asObservable() } },
      ],
    })
      .overrideComponent(AskDataComponent, { set: { template: '', imports: [] } })
      .overrideComponent(ToolbarComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app component', () => {
    expect(component).toBeTruthy();
  });

  it('should contain a mat-sidenav-container with correct styles', () => {
    const container = fixture.debugElement.query(By.css('mat-sidenav-container'));
    expect(container).toBeTruthy();
    expect(container.classes['h-full-container']).toBe(true);
  });

  it('should have an accessible mat-sidenav', () => {
    const sidenav = fixture.debugElement.query(By.css('mat-sidenav'));
    expect(sidenav.attributes['aria-label']).toBe('Ask Data Assistant');
  });

  it('should respond to service signal changes', () => {
    const sidenavElement = fixture.debugElement.query(By.css('mat-sidenav'));
    expect(component.askData.isOpen()).toBe(false);
    expect(sidenavElement.componentInstance.opened).toBe(false);
    mockAskDataService.isOpen.set(true);
    fixture.detectChanges();
    expect(sidenavElement.componentInstance.opened).toBe(true);
  });

  it('should call service.close() when sidenav emits closed event', () => {
    const sidenav = fixture.debugElement.query(By.css('mat-sidenav'));
    sidenav.triggerEventHandler('closed', {});
    expect(mockAskDataService.close).toHaveBeenCalled();
  });

  it('should contain router-outlet inside main content area', () => {
    const content = fixture.debugElement.query(By.css('mat-sidenav-content'));
    expect(content.attributes['role']).toBe('main');
    const outlet = content.query(By.directive(RouterOutlet));
    expect(outlet).toBeTruthy();
  });

  it('should render the AskData component inside the drawer', () => {
    const sidenav = fixture.debugElement.query(By.css('mat-sidenav'));
    const askData = sidenav.query(By.css('app-ask-data'));
    expect(askData).toBeTruthy();
  });

  it('should enable TV mode when query param mode=tv', () => {
    queryParams$.next({ mode: 'tv' });
    fixture.detectChanges();
    expect(mockThemeService.setTvMode).toHaveBeenCalledWith(true);
  });

  it('should ignore non-tv mode query params', () => {
    queryParams$.next({ mode: 'desktop' });
    fixture.detectChanges();
    expect(mockThemeService.setTvMode).not.toHaveBeenCalled();
  });

  it('should hide toolbar in tv mode', () => {
    mockThemeService.isTvMode.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('app-toolbar'))).toBeFalsy();
  });
});
