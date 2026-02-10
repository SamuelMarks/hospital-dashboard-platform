/** 
 * @fileoverview Unit tests for the App Root Component. 
 * Includes manual mocking of @material/material-color-utilities. 
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
  argbFromHex: () => 0xFFFFFFFF,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true
}));

describe('App', () => { 
  let fixture: ComponentFixture<App>; 
  let component: App; 
  let queryParams$: Subject<Record<string, any>>;
  let mockThemeService: { isTvMode: ReturnType<typeof signal>; setTvMode: ReturnType<typeof vi.fn> };
  let mockDashboardsService: {
    listDashboardsApiV1DashboardsGet: ReturnType<typeof vi.fn>;
    createDashboardApiV1DashboardsPost: ReturnType<typeof vi.fn>;
    createWidgetApiV1DashboardsDashboardIdWidgetsPost: ReturnType<typeof vi.fn>;
    deleteDashboardApiV1DashboardsDashboardIdDelete: ReturnType<typeof vi.fn>;
  };
  let mockCartService: { count: ReturnType<typeof signal>; add: ReturnType<typeof vi.fn> };
  let mockAuthService: {
    currentUser: ReturnType<typeof signal>;
    isAuthenticated: ReturnType<typeof signal>;
    logout: ReturnType<typeof vi.fn>;
  };
  let mockDashboardStore: {
    dashboard: ReturnType<typeof signal>;
    isEditMode: ReturnType<typeof signal>;
    toggleEditMode: ReturnType<typeof vi.fn>;
    refreshAll: ReturnType<typeof vi.fn>;
    isLoading: ReturnType<typeof signal>;
    loadDashboard: ReturnType<typeof vi.fn>;
  };
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  
  // Mock Service Configuration
  let mockAskDataService: { 
    isOpen: WritableSignal<boolean>; 
    close: ReturnType<typeof vi.fn>; 
  }; 

  beforeEach(async () => { 
    await resolveComponentResourcesForTests();

    // Initialize mock signal for state testing
    mockAskDataService = { 
      isOpen: signal(false), 
      close: vi.fn(),
      open: vi.fn()
    }; 
    mockDashboardsService = {
      listDashboardsApiV1DashboardsGet: vi.fn().mockReturnValue(of([])),
      createDashboardApiV1DashboardsPost: vi.fn().mockReturnValue(of({ id: 'd1', widgets: [] })),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn().mockReturnValue(of({ id: 'w1' })),
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn().mockReturnValue(of({}))
    };
    mockCartService = { count: signal(0), add: vi.fn() };
    mockAuthService = {
      currentUser: signal({ email: 'test@example.com' }),
      isAuthenticated: signal(false),
      logout: vi.fn()
    };
    mockDashboardStore = {
      dashboard: signal(null),
      isEditMode: signal(false),
      toggleEditMode: vi.fn(),
      refreshAll: vi.fn(),
      isLoading: signal(false),
      loadDashboard: vi.fn()
    };
    mockDialog = {
      open: vi.fn().mockReturnValue({ afterClosed: () => of(false) })
    };
    queryParams$ = new Subject<Record<string, any>>();
    mockThemeService = {
      isTvMode: signal(false),
      setTvMode: vi.fn()
    };

    TestBed.configureTestingModule({ 
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
        // Provide Router to satisfy ActivatedRoute dependency in App component
        provideRouter([]) 
      ] 
    }); 
    TestBed.overrideComponent(AskDataComponent, { 
      set: { template: '', imports: [] } 
    }); 
    TestBed.overrideComponent(ToolbarComponent, { 
      set: { template: '', imports: [] } 
    }); 
    await resolveComponentResourcesForTests();
    await TestBed.compileComponents(); 

    TestBed.overrideProvider(ActivatedRoute, { useValue: { queryParams: queryParams$.asObservable() } });

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
    expect(sidenav).toBeTruthy(); 
    // Check for A11y label
    expect(sidenav.attributes['aria-label']).toBe('Ask Data Assistant'); 
  }); 

  it('should respond to service signal changes', () => { 
    const sidenavElement = fixture.debugElement.query(By.css('mat-sidenav')); 
    
    // Initial State: Closed
    expect(component.askData.isOpen()).toBe(false); 
    expect(sidenavElement.componentInstance.opened).toBe(false); 

    // Update Signal: Open
    mockAskDataService.isOpen.set(true); 
    fixture.detectChanges(); 

    expect(sidenavElement.componentInstance.opened).toBe(true); 
  }); 

  it('should call service.close() when sidenav emits closed event', () => { 
    const sidenav = fixture.debugElement.query(By.css('mat-sidenav')); 
    
    // Simulate the close event (e.g. clicking backdrop) 
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
    // Ensure content (even if projected) is queried correctly
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
