import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AskDataComponent } from './ask-data.component';
import { AskDataService } from './ask-data.service';
import { QueryCartService } from './query-cart.service';
import { DashboardsService, DashboardResponse, WidgetResponse } from '../api-client';
import { AuthService } from '../core/auth/auth.service';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { signal, WritableSignal, PLATFORM_ID, Component, input, output, NO_ERRORS_SCHEMA } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { readTemplate } from '../../test-utils/component-resources';

@Component({
  selector: 'app-sql-builder',
  template: '<div data-testid="mock-sql-builder"></div>'
})
class MockSqlBuilderComponent {
  readonly dashboardId = input<string | undefined>();
  readonly widgetId = input<string | undefined>();
  readonly initialSql = input<string | undefined>();
  readonly initialTab = input<number | undefined>();
  readonly enableCart = input<boolean | undefined>();
  readonly saveToCart = output<string>();
}

const MOCK_DASH_ID = 'temp-dash-123';
const MOCK_WIDGET_ID = 'temp-widget-456';
const makeWidget = (overrides: Partial<WidgetResponse> = {}): WidgetResponse => ({
  id: 'w1',
  dashboard_id: MOCK_DASH_ID,
  title: 'Widget',
  type: 'SQL',
  visualization: 'table',
  config: {},
  ...overrides
});

describe('AskDataComponent', () => {
  let component: AskDataComponent;
  let fixture: ComponentFixture<AskDataComponent>;
  let mockDashApi: any;
  let mockAskService: any;
  let mockAuthService: any;
  let mockCartService: any;
  let isAuthenticatedSig: WritableSignal<boolean>;

  beforeEach(async () => {
    mockDashApi = {
      listDashboardsApiV1DashboardsGet: vi.fn(),
      createDashboardApiV1DashboardsPost: vi.fn(),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn() // Cleanup requires this
    };
    mockAskService = {
      close: vi.fn(),
      isOpen: signal(true)
    };
    mockCartService = {
      add: vi.fn(),
      count: signal(0)
    };
    
    isAuthenticatedSig = signal(false);
    mockAuthService = { isAuthenticated: isAuthenticatedSig };

    // Default mock returns to prevent "undefined reading pipe/subscribe"
    mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));
    mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(of({ id: MOCK_DASH_ID }));
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of({ id: MOCK_WIDGET_ID }));
    mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [AskDataComponent, NoopAnimationsModule],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AskDataService, useValue: mockAskService },
        { provide: QueryCartService, useValue: mockCartService },
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    })
    .overrideComponent(AskDataComponent, {
      remove: { imports: [SqlBuilderComponent] },
      add: { imports: [MockSqlBuilderComponent] }
    })
    .overrideComponent(AskDataComponent, {
      set: { template: readTemplate('./ask-data.component.html'), templateUrl: null, schemas: [NO_ERRORS_SCHEMA] }
    })
    .compileComponents();

    fixture = TestBed.createComponent(AskDataComponent);
    component = fixture.componentInstance;
  });

  describe('Initialization', () => {
    it('should Reuse existing scratchpad if found', () => {
      const existingDash = {
        id: 'existing-id',
        name: 'Scratchpad (Temp)',
        owner_id: 'u1',
        widgets: [makeWidget({ id: 'existing-widget', dashboard_id: 'existing-id', title: 'AdHoc Query' })]
      } as DashboardResponse;

      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([existingDash]));

      fixture.detectChanges();
      isAuthenticatedSig.set(true);
      fixture.detectChanges();

      expect(mockDashApi.listDashboardsApiV1DashboardsGet).toHaveBeenCalled();
      expect(mockDashApi.createDashboardApiV1DashboardsPost).not.toHaveBeenCalled();
      expect(component.scratchpadIds()).toEqual({ dashboardId: 'existing-id', widgetId: 'existing-widget' });
    });
    
    it('should create widget when existing scratchpad has no widgets list', () => {
      const existingDash = {
        id: 'existing-id',
        name: 'Scratchpad (Temp)',
        owner_id: 'u1'
      } as DashboardResponse;

      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([existingDash]));
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of({ id: MOCK_WIDGET_ID } as WidgetResponse)
      );

      fixture.detectChanges();
      isAuthenticatedSig.set(true);
      fixture.detectChanges();

      expect(mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost).toHaveBeenCalled();
      expect(component.scratchpadIds()).toEqual({ dashboardId: 'existing-id', widgetId: MOCK_WIDGET_ID });
    });

    it('should Create new scratchpad if none exist', () => {
      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));
      
      mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(
        of({ id: MOCK_DASH_ID, name: 'Scratchpad (Temp)', owner_id: 'u1', widgets: [] } as DashboardResponse)
      );
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of(makeWidget({ id: MOCK_WIDGET_ID }))
      );

      fixture.detectChanges();
      isAuthenticatedSig.set(true);
      fixture.detectChanges();

      expect(mockDashApi.listDashboardsApiV1DashboardsGet).toHaveBeenCalled();
      expect(mockDashApi.createDashboardApiV1DashboardsPost).toHaveBeenCalled();
      expect(component.scratchpadIds()).toEqual({ dashboardId: MOCK_DASH_ID, widgetId: MOCK_WIDGET_ID });
    });

    it('should show error state on failure', () => {
      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(throwError(() => 'API Error'));
      
      fixture.detectChanges();
      isAuthenticatedSig.set(true);
      fixture.detectChanges();

      expect(component.contextError()).toContain('Failed to check');
      const errEl = fixture.debugElement.query(By.css('[data-testid="error-state"]'));
      expect(errEl).toBeTruthy();
    });

    it('should handle create dashboard failure', () => {
      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));
      mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(throwError(() => 'create fail'));

      fixture.detectChanges();
      isAuthenticatedSig.set(true);
      fixture.detectChanges();

      expect(component.contextError()).toContain('Failed to initialize scratchpad dashboard');
      expect(component.loadingContext()).toBe(false);
    });

    it('should handle create widget failure', () => {
      const existingDash = {
        id: 'existing-id',
        name: 'Scratchpad (Temp)',
        owner_id: 'u1',
        widgets: []
      } as DashboardResponse;

      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([existingDash]));
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(throwError(() => 'widget fail'));

      fixture.detectChanges();
      isAuthenticatedSig.set(true);
      fixture.detectChanges();

      expect(component.contextError()).toContain('Failed to create scratchpad widget');
      expect(component.loadingContext()).toBe(false);
    });
  });

  it('should add SQL to cart when saved', () => {
    component.handleSaveToCart('SELECT 1');
    expect(mockCartService.add).toHaveBeenCalledWith('SELECT 1');
  });

  describe('UI & Destruction', () => {
    beforeEach(() => {
       mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));
       mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(
         of({ id: MOCK_DASH_ID, name: 'Scratchpad (Temp)', owner_id: 'u1', widgets: [] } as DashboardResponse)
       );
       mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
         of(makeWidget({ id: MOCK_WIDGET_ID }))
       );
       isAuthenticatedSig.set(true);
       fixture.detectChanges(); // Validates creation
    });

    it('should cleanup backend dashboard on destroy', () => {
      fixture.destroy();
      expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).toHaveBeenCalledWith(MOCK_DASH_ID);
    });

    it('should warn when cleanup fails', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue(
        throwError(() => new Error('fail'))
      );
      component.scratchpadIds.set({ dashboardId: 'd1', widgetId: 'w1' });
      component.ngOnDestroy();
      expect(warnSpy).toHaveBeenCalledWith('Failed to clean up scratchpad', expect.anything());
      warnSpy.mockRestore();
    });
  });

  it('should skip cleanup when no scratchpad ids', () => {
    component.scratchpadIds.set(null);
    component.ngOnDestroy();
    expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).not.toHaveBeenCalled();
  });

  it('should reset state when user logs out with existing context', () => {
    component.scratchpadIds.set({ dashboardId: 'd1', widgetId: 'w1' });
    component.loadingContext.set(false);
    component.contextError.set('err');

    isAuthenticatedSig.set(false);
    fixture.detectChanges();

    expect(component.scratchpadIds()).toBeNull();
    expect(component.loadingContext()).toBe(true);
    expect(component.contextError()).toBeNull();
  });

  it('should disable loading on server platform', async () => {
    TestBed.resetTestingModule();
    mockDashApi = {
      listDashboardsApiV1DashboardsGet: vi.fn(),
      createDashboardApiV1DashboardsPost: vi.fn(),
      createWidgetApiV1DashboardsDashboardIdWidgetsPost: vi.fn(),
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn()
    };
    mockAskService = { close: vi.fn(), isOpen: signal(false) };
    mockAuthService = { isAuthenticated: signal(false) };
    mockCartService = { add: vi.fn(), count: signal(0) };

    await TestBed.configureTestingModule({
      imports: [AskDataComponent, NoopAnimationsModule],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AskDataService, useValue: mockAskService },
        { provide: QueryCartService, useValue: mockCartService },
        { provide: PLATFORM_ID, useValue: 'server' }
      ]
    })
    .overrideComponent(AskDataComponent, {
      remove: { imports: [SqlBuilderComponent] },
      add: { imports: [MockSqlBuilderComponent] }
    })
    .overrideComponent(AskDataComponent, {
      set: { template: readTemplate('./ask-data.component.html'), templateUrl: null, schemas: [NO_ERRORS_SCHEMA] }
    })
    .compileComponents();

    const serverFixture = TestBed.createComponent(AskDataComponent);
    const serverComponent = serverFixture.componentInstance;
    serverFixture.detectChanges();

    expect(serverComponent.loadingContext()).toBe(false);
    serverComponent.ngOnDestroy();
    expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).not.toHaveBeenCalled();
  });

  it('should close via header button', () => {
    fixture.detectChanges();
    const closeBtn = fixture.debugElement.query(By.css('[data-testid=\"close-btn\"]'));
    closeBtn.triggerEventHandler('click', null);
    expect(mockAskService.close).toHaveBeenCalled();
  });

  it('should render builder and forward saveToCart event', () => {
    isAuthenticatedSig.set(true);
    component.contextError.set(null);
    component.loadingContext.set(false);
    component.scratchpadIds.set({ dashboardId: MOCK_DASH_ID, widgetId: MOCK_WIDGET_ID });
    fixture.detectChanges();
    const builder = fixture.debugElement.query(By.directive(MockSqlBuilderComponent))
      || fixture.debugElement.query(By.css('app-sql-builder'));
    expect(builder).toBeTruthy();
    builder.triggerEventHandler('saveToCart', 'SELECT 42');
    expect(mockCartService.add).toHaveBeenCalledWith('SELECT 42');
  });

  it('should show loading overlay when initializing', () => {
    component.loadingContext.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-testid=\"loading-state\"]'))).toBeTruthy();
  });
});
