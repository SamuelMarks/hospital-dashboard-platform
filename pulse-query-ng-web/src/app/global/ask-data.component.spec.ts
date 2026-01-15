import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AskDataComponent } from './ask-data.component';
import { AskDataService } from './ask-data.service';
import { DashboardsService, DashboardResponse, WidgetResponse } from '../api-client';
import { AuthService } from '../core/auth/auth.service';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { signal, WritableSignal, PLATFORM_ID } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

const MOCK_DASH_ID = 'temp-dash-123';
const MOCK_WIDGET_ID = 'temp-widget-456';

describe('AskDataComponent', () => {
  let component: AskDataComponent;
  let fixture: ComponentFixture<AskDataComponent>;
  let mockDashApi: any;
  let mockAskService: any;
  let mockAuthService: any;
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
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AskDataComponent);
    component = fixture.componentInstance;
  });

  describe('Initialization', () => {
    it('should Reuse existing scratchpad if found', () => {
      const existingDash = {
        id: 'existing-id',
        name: 'Scratchpad (Temp)',
        widgets: [{ id: 'existing-widget', title: 'AdHoc Query' }]
      } as DashboardResponse;

      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([existingDash]));

      fixture.detectChanges();
      isAuthenticatedSig.set(true);
      fixture.detectChanges();

      expect(mockDashApi.listDashboardsApiV1DashboardsGet).toHaveBeenCalled();
      expect(mockDashApi.createDashboardApiV1DashboardsPost).not.toHaveBeenCalled();
      expect(component.scratchpadIds()).toEqual({ dashboardId: 'existing-id', widgetId: 'existing-widget' });
    });

    it('should Create new scratchpad if none exist', () => {
      mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));
      
      mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(of({ id: MOCK_DASH_ID } as DashboardResponse));
      mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of({ id: MOCK_WIDGET_ID } as WidgetResponse));

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
  });

  describe('UI & Destruction', () => {
    beforeEach(() => {
       mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of([]));
       mockDashApi.createDashboardApiV1DashboardsPost.mockReturnValue(of({ id: MOCK_DASH_ID } as DashboardResponse));
       mockDashApi.createWidgetApiV1DashboardsDashboardIdWidgetsPost.mockReturnValue(of({ id: MOCK_WIDGET_ID } as WidgetResponse));
       isAuthenticatedSig.set(true);
       fixture.detectChanges(); // Validates creation
    });

    it('should cleanup backend dashboard on destroy', () => {
      fixture.destroy();
      expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).toHaveBeenCalledWith(MOCK_DASH_ID);
    });
  });
});