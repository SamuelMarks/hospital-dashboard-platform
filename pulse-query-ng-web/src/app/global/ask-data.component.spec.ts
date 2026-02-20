import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AskDataComponent } from './ask-data.component';
import { AskDataService } from './ask-data.service';
import { QueryCartService } from './query-cart.service';
import { DashboardsService, DashboardResponse, WidgetResponse } from '../api-client';
import { AuthService } from '../core/auth/auth.service';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import {
  signal,
  WritableSignal,
  PLATFORM_ID,
  Component,
  input,
  output,
  NO_ERRORS_SCHEMA,
} from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SqlBuilderComponent } from '../editors/sql-builder.component';
import { readTemplate } from '../../test-utils/component-resources';
import { vi } from 'vitest';

@Component({
  selector: 'app-sql-builder',
  template: '<div data-testid="mock-sql-builder"></div>',
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
  ...overrides,
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
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn(),
    };
    mockAskService = {
      close: vi.fn(),
      isOpen: signal(true),
    };
    mockCartService = {
      add: vi.fn(),
      count: signal(0),
    };

    isAuthenticatedSig = signal(false);
    mockAuthService = { isAuthenticated: isAuthenticatedSig };

    mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));
    mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(of({ id: MOCK_DASH_ID }));
    mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
      of({ id: MOCK_WIDGET_ID }),
    );
    mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue(of(null));

    await TestBed.configureTestingModule({
      imports: [AskDataComponent, NoopAnimationsModule],
      providers: [
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AskDataService, useValue: mockAskService },
        { provide: QueryCartService, useValue: mockCartService },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    })
      .overrideComponent(AskDataComponent, {
        remove: { imports: [SqlBuilderComponent] },
        add: { imports: [MockSqlBuilderComponent] },
      })
      .overrideComponent(AskDataComponent, {
        set: {
          template: readTemplate('./ask-data.component.html'),
          templateUrl: undefined,
          schemas: [NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AskDataComponent);
    component = fixture.componentInstance;
  });

  describe('Initialization', () => {
    it('should Create new scratchpad if none exist', () => {
      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));

      mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(
        of({
          id: MOCK_DASH_ID,
          name: 'Scratchpad (Temp)',
          owner_id: 'u1',
          widgets: [],
        } as DashboardResponse),
      );
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(
        of(makeWidget({ id: MOCK_WIDGET_ID })),
      );

      fixture.detectChanges();
      // Trigger effect: Not Auth -> Auth
      isAuthenticatedSig.set(true);
      fixture.detectChanges();
      TestBed.flushEffects();

      expect(mockDashApi.listDashboardsApiV1DashboardsGet).toHaveBeenCalled();
      expect(mockDashApi.createDashboardApiV1DashboardsPost).toHaveBeenCalled();
      expect(component.scratchpadIds()).toEqual({
        dashboardId: MOCK_DASH_ID,
        widgetId: MOCK_WIDGET_ID,
      });
    });

    it('should show error state on failure', async () => {
      // Silence console error for this expected error test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(throwError(() => 'API Error'));

      fixture.detectChanges();
      isAuthenticatedSig.set(true);

      // Allow effect to run and signals to settle
      fixture.detectChanges();
      TestBed.flushEffects();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.contextError()).toContain('Failed to check');
      const errEl = fixture.debugElement.query(By.css('[data-testid="error-state"]'));
      expect(errEl).toBeTruthy();

      consoleSpy.mockRestore();
    });
  });

  it('should show loading overlay when initializing', () => {
    // Force the signals to specific values regardless of effect
    // We set loading=true
    component.loadingContext.set(true);
    component.contextError.set(null);
    component.scratchpadIds.set(null);

    // Explicitly run change detection to update view
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('[data-testid="loading-state"]'))).toBeTruthy();
  });
});
