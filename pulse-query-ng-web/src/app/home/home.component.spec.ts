import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { DashboardsService, DashboardResponse } from '../api-client';
import { provideRouter, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError, Subject } from 'rxjs';
import { signal } from '@angular/core';
import { AskDataService } from '../global/ask-data.service';
import { AuthService } from '../core/auth/auth.service';
import { readTemplate } from '../../test-utils/component-resources';
import { PromptDialogComponent } from '../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';
import { vi } from 'vitest';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mockDashApi: any;
  let mockDialog: any;
  let mockSnackBar: any;
  let mockAskDataService: any;
  let router: Router;

  const mockDashboardList: DashboardResponse[] = [
    { id: 'd1', name: 'Finance', owner_id: 'u1', widgets: [] },
    { id: 'd2', name: 'Operations', owner_id: 'u1', widgets: [] },
  ];

  beforeEach(async () => {
    mockDashApi = {
      listDashboardsApiV1DashboardsGet: vi.fn().mockReturnValue(of(mockDashboardList)),
      updateDashboardApiV1DashboardsDashboardIdPut: vi.fn(),
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn(),
      cloneDashboardApiV1DashboardsDashboardIdClonePost: vi.fn(),
      restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: vi.fn(),
    };
    mockDialog = { open: vi.fn() };
    mockAskDataService = { open: vi.fn() };
    mockSnackBar = {
      open: vi.fn().mockReturnValue({
        onAction: () => of(void 0),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DashboardsService, useValue: mockDashApi },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AskDataService, useValue: mockAskDataService },
        {
          provide: AuthService,
          useValue: { currentUser: signal(null), isAuthenticated: signal(false), logout: vi.fn() },
        },
        // Force provider override
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    })
      .overrideComponent(HomeComponent, {
        set: {
          providers: [
            { provide: MatDialog, useValue: mockDialog },
            { provide: MatSnackBar, useValue: mockSnackBar },
          ],
          template: readTemplate('./home.component.html'),
          templateUrl: undefined,
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('should ignore rename when dialog cancelled', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
    component.renameDashboard(mockDashboardList[0]);
    expect(mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut).not.toHaveBeenCalled();
  });

  it('should rename when dialog confirmed', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of('New Name') });
    mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut.mockReturnValue(of({}));

    component.renameDashboard(mockDashboardList[0]);

    expect(mockDialog.open).toHaveBeenCalledWith(PromptDialogComponent, expect.anything());
    expect(mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut).toHaveBeenCalledWith('d1', {
      name: 'New Name',
    });
  });

  it('should optimistic delete and revert on error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });
    mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue(
      throwError(() => new Error('fail')),
    );

    // Initial State: 2 items
    expect(component.dashboards().length).toBe(2);

    component.deleteDashboard(mockDashboardList[0]);

    // Check restore happened (snack bar call implies error block reached)
    expect(mockSnackBar.open).toHaveBeenCalled();
    expect(component.dashboards().length).toBe(2);

    consoleSpy.mockRestore();
  });
});
