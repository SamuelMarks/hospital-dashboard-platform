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
import { ThemeService } from '../core/theme/theme.service';
import { OnboardingService } from '../shared/components/onboarding/onboarding.service';
import { readTemplate } from '../../test-utils/component-resources';
import { PromptDialogComponent } from '../shared/components/dialogs/prompt-dialog.component';
import { ConfirmDialogComponent } from '../shared/components/dialogs/confirm-dialog.component';
import { DashboardCreateDialog } from './dashboard-create.dialog';
import { vi } from 'vitest';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mockDashApi: any;
  let mockDialog: any;
  let mockSnackBar: any;
  let mockAskDataService: any;
  let mockThemeService: any;
  let mockOnboardingService: any;
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
    
    // We need to trigger the onAction observable from the snackbar
    const snackBarAction$ = new Subject<void>();
    mockSnackBar = {
      open: vi.fn().mockReturnValue({
        onAction: () => snackBarAction$.asObservable(),
      }),
      _action$: snackBarAction$ // expose for tests
    };
    mockThemeService = {
      isDark: signal(false),
      mode: signal('light' as const),
      seedColor: signal('#1565c0'),
      isTvMode: signal(false),
      toggle: vi.fn(),
    };
    mockOnboardingService = {
      isVisible: signal(false),
      isComplete: signal(true),
      currentStepIndex: signal(0),
      currentStep: signal({ id: 'welcome', title: 'Welcome', description: 'Desc', icon: 'home' }),
      totalSteps: signal(5),
      hasNext: signal(true),
      hasPrev: signal(false),
      progress: signal(20),
      next: vi.fn(),
      prev: vi.fn(),
      skip: vi.fn(),
      complete: vi.fn(),
      start: vi.fn(),
      goToStep: vi.fn(),
      reset: vi.fn(),
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
        { provide: ThemeService, useValue: mockThemeService },
        { provide: OnboardingService, useValue: mockOnboardingService },
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

  // --- loadDashboards ---
  it('should handle loadDashboards error and retry', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValueOnce(throwError(() => new Error('load err')));
    
    component.loadDashboards();
    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to load dashboards', 'Retry', { duration: 5000 });
    expect(component.isLoading()).toBe(false);
    
    // Simulate clicking retry
    mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValueOnce(of(mockDashboardList));
    mockSnackBar._action$.next();
    
    expect(mockDashApi.listDashboardsApiV1DashboardsGet).toHaveBeenCalledTimes(3); // 1 init, 1 err, 1 retry
    consoleSpy.mockRestore();
  });

  // --- openCreateDialog ---
  it('should open create dialog and navigate on success', () => {
    const newDash = { id: 'd3', name: 'New Dash' };
    mockDialog.open.mockReturnValue({ afterClosed: () => of(newDash) });
    
    component.openCreateDialog();
    
    expect(mockDialog.open).toHaveBeenCalledWith(DashboardCreateDialog, expect.anything());
    expect(component.dashboards()).toContainEqual(newDash);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard', 'd3']);
  });
  
  it('should handle openCreateDialog without result', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(null) });
    component.openCreateDialog();
    expect(router.navigate).not.toHaveBeenCalledWith(['/dashboard', undefined]);
  });

  // --- restoreDefaults ---
  it('should restore default dashboard successfully', () => {
    const newDash = { id: 'd-def', name: 'Default' };
    mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(of(newDash));
    
    component.restoreDefaults();
    
    expect(component.dashboards()[0]).toEqual(newDash);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard', 'd-def']);
    expect(mockSnackBar.open).toHaveBeenCalledWith('Default dashboard created.', 'Close', { duration: 3000 });
  });

  it('should handle error when restoring defaults', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(throwError(() => new Error('restore err')));
    
    component.restoreDefaults();
    
    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to restore defaults.', 'Close');
    consoleSpy.mockRestore();
  });

  // --- renameDashboard ---
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
    // Check optimistic update
    expect(component.dashboards().find(d => d.id === 'd1')?.name).toBe('New Name');
  });
  
  it('should revert rename when API fails', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDialog.open.mockReturnValue({ afterClosed: () => of('New Name') });
    mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut.mockReturnValue(throwError(() => new Error('update err')));

    component.renameDashboard(mockDashboardList[0]);

    // Should revert back to original
    expect(component.dashboards().find(d => d.id === 'd1')?.name).toBe('Finance');
    expect(mockSnackBar.open).toHaveBeenCalledWith('Rename failed. Reverted.', 'Close', { duration: 5000 });
    consoleSpy.mockRestore();
  });

  // --- cloneDashboard ---
  it('should clone dashboard successfully', () => {
    const clonedDash = { id: 'd1-clone', name: 'Finance (Clone)' };
    mockDashApi.cloneDashboardApiV1DashboardsDashboardIdClonePost.mockReturnValue(of(clonedDash));
    
    component.cloneDashboard(mockDashboardList[0]);
    
    expect(component.dashboards()).toContainEqual(clonedDash);
    expect(mockSnackBar.open).toHaveBeenCalledWith('Cloned "Finance" successfully', 'Close', { duration: 3000 });
  });

  it('should handle clone dashboard error', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDashApi.cloneDashboardApiV1DashboardsDashboardIdClonePost.mockReturnValue(throwError(() => new Error('clone err')));
    
    component.cloneDashboard(mockDashboardList[0]);
    
    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to clone.', 'Close', { duration: 5000 });
    consoleSpy.mockRestore();
  });

  // --- deleteDashboard ---
  it('should delete dashboard successfully', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(true) });
    mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue(of({}));

    component.deleteDashboard(mockDashboardList[0]);
    
    // Check it's removed
    expect(component.dashboards().find(d => d.id === 'd1')).toBeUndefined();
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

    // Check restore happened
    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to delete. Restored item.', 'Close', { duration: 5000 });
    expect(component.dashboards().length).toBe(2);

    consoleSpy.mockRestore();
  });
  
  it('should do nothing if delete is cancelled', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(false) });
    component.deleteDashboard(mockDashboardList[0]);
    expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).not.toHaveBeenCalled();
  });
});
