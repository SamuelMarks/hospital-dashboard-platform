import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { HomeComponent } from './home.component'; 
import { DashboardsService, DashboardResponse } from '../api-client'; 
import { provideRouter, Router } from '@angular/router'; 
import { MatDialog } from '@angular/material/dialog'; 
import { MatMenuModule } from '@angular/material/menu'; 
import { MatSnackBar } from '@angular/material/snack-bar'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { By } from '@angular/platform-browser';
import { MatMenuTrigger } from '@angular/material/menu';
import { OverlayContainer } from '@angular/cdk/overlay';
import { of, throwError, Subject } from 'rxjs'; 
import { AskDataService } from '../global/ask-data.service';
import { readTemplate } from '../../test-utils/component-resources';

describe('HomeComponent', () => { 
  let component: HomeComponent; 
  let fixture: ComponentFixture<HomeComponent>; 
  
  let mockDashApi: any; 
  let mockDialog: any; 
  let mockSnackBar: any; 
  let mockAskDataService: any;
  let router: Router;
  let overlay: OverlayContainer;

  const mockDashboardList: DashboardResponse[] = [ 
    { id: 'd1', name: 'Finance', owner_id: 'u1', widgets: [] }, 
    { id: 'd2', name: 'Operations', owner_id: 'u1', widgets: [] } 
  ]; 

  beforeEach(async () => { 
    mockDashApi = { 
      listDashboardsApiV1DashboardsGet: vi.fn(), 
      updateDashboardApiV1DashboardsDashboardIdPut: vi.fn(), 
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn(), 
      cloneDashboardApiV1DashboardsDashboardIdClonePost: vi.fn(), // Updated with clone
      restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost: vi.fn()
    }; 
    mockDialog = { open: vi.fn() }; 
    mockAskDataService = { open: vi.fn() };
    
    // Create the mock object explicitly to ensure reference identity
    mockSnackBar = { 
        open: vi.fn().mockReturnValue({ 
            onAction: () => of(void 0) 
        }) 
    }; 

    mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(of(mockDashboardList)); 

    await TestBed.configureTestingModule({ 
      imports: [HomeComponent, NoopAnimationsModule, MatMenuModule], 
      providers: [ 
        provideRouter([]), 
        { provide: DashboardsService, useValue: mockDashApi }, 
        { provide: MatDialog, useValue: mockDialog }, 
        { provide: AskDataService, useValue: mockAskDataService },
        // 1. Provide at Module Level
        { provide: MatSnackBar, useValue: mockSnackBar } 
      ] 
    }) 
    // 2. Force override at Component Level to ensure the standalone component 
    // uses our mock instead of the one provided by MatSnackBarModule import
    .overrideComponent(HomeComponent, { 
      set: { 
        providers: [ 
          { provide: MatDialog, useValue: mockDialog },
          { provide: MatSnackBar, useValue: mockSnackBar } 
        ],
        template: readTemplate('./home.component.html'),
        templateUrl: null
      } 
    }) 
    .compileComponents(); 

    fixture = TestBed.createComponent(HomeComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
    router = TestBed.inject(Router);
    overlay = TestBed.inject(OverlayContainer);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  }); 

  afterEach(() => { 
    vi.restoreAllMocks(); 
  }); 

  it('should show error and allow retry when load fails', () => {
    mockDashApi.listDashboardsApiV1DashboardsGet.mockReturnValue(
      throwError(() => new Error('load fail'))
    );
    const retry$ = new Subject<void>();
    mockSnackBar.open.mockReturnValue({ onAction: () => retry$ });
    const loadSpy = vi.spyOn(component, 'loadDashboards');

    component.loadDashboards();

    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to load dashboards', 'Retry', { duration: 5000 });
    retry$.next();
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });

  it('should open create dialog and navigate on result', () => {
    const newDash = { id: 'd3', name: 'New Dash', owner_id: 'u1', widgets: [] };
    mockDialog.open.mockReturnValue({ afterClosed: () => of(newDash) });

    component.openCreateDialog();

    expect(component.dashboards().some(d => d.id === 'd3')).toBe(true);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard', 'd3']);
  });

  it('should not navigate when create dialog closes without result', () => {
    mockDialog.open.mockReturnValue({ afterClosed: () => of(undefined) });

    component.openCreateDialog();

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('should restore defaults and navigate', () => {
    const newDash = { id: 'd9', name: 'Default', owner_id: 'u1', widgets: [] };
    mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(of(newDash));

    component.restoreDefaults();

    expect(mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard', 'd9']);
    expect(mockSnackBar.open).toHaveBeenCalledWith('Default dashboard created.', 'Close', { duration: 3000 });
  });

  it('should handle restore defaults error', () => {
    mockDashApi.restoreDefaultDashboardApiV1DashboardsRestoreDefaultsPost.mockReturnValue(
      throwError(() => new Error('restore fail'))
    );

    component.restoreDefaults();

    expect(mockSnackBar.open).toHaveBeenCalledWith('Failed to restore defaults.', 'Close');
  });

  it('should ignore rename when prompt is empty or unchanged', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('');
    component.renameDashboard(mockDashboardList[0]);
    expect(mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut).not.toHaveBeenCalled();

    vi.spyOn(window, 'prompt').mockReturnValue('Finance');
    component.renameDashboard(mockDashboardList[0]);
    expect(mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut).not.toHaveBeenCalled();
  });

  it('should not delete when confirm is false', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.deleteDashboard(mockDashboardList[0]);
    expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).not.toHaveBeenCalled();
  });

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  describe('Optimistic Deletion', () => { 
    it('should remove dashboard instantly from UI then call API', () => { 
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true); 
      mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue(of({})); 

      component.deleteDashboard(mockDashboardList[0]); 
      
      expect(component.dashboards().length).toBe(1); 
      expect(component.dashboards()[0].id).toBe('d2'); 

      expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).toHaveBeenCalledWith('d1'); 
    }); 

    it('should rollback UI if delete API fails', () => { 
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true); 
      
      // Setup error response
      mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue( 
          throwError(() => new Error('API Fail')) 
      ); 

      component.deleteDashboard(mockDashboardList[0]); 
      
      // Rollback check
      expect(component.dashboards().length).toBe(2); 
      expect(component.dashboards()[0].id).toBe('d1'); 
      
      // Ensure specific spy was called
      expect(mockSnackBar.open).toHaveBeenCalled(); 
    }); 
  }); 

  describe('Optimistic Renaming', () => { 
    it('should update name instantly then call API', () => { 
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Super Finance'); 
      mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut.mockReturnValue(of({} as DashboardResponse)); 

      component.renameDashboard(mockDashboardList[0]); 

      expect(component.dashboards()[0].name).toBe('Super Finance'); 
      
      expect(mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut).toHaveBeenCalledWith('d1', { name: 'Super Finance' }); 
    }); 

    it('should revert name if API fails', () => { 
      const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Bad Name'); 
      mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut.mockReturnValue( 
          throwError(() => new Error('API Fail')) 
      ); 

      component.renameDashboard(mockDashboardList[0]); 

      // Rollback check
      expect(component.dashboards()[0].name).toBe('Finance'); 
      expect(mockSnackBar.open).toHaveBeenCalled(); 
    }); 
  }); 

  describe('Cloning', () => { 
    it('should call clone API and update list', () => { 
      const newDash = { id: 'd3', name: 'Copy of Finance', owner_id: 'u1', widgets: [] }; 
      mockDashApi.cloneDashboardApiV1DashboardsDashboardIdClonePost.mockReturnValue(of(newDash)); 

      component.cloneDashboard(mockDashboardList[0]); 

      expect(mockDashApi.cloneDashboardApiV1DashboardsDashboardIdClonePost).toHaveBeenCalledWith('d1'); 
      // Verify list update (dashboards signal is array of Dashboards) 
      const currentList = component.dashboards(); 
      expect(currentList.length).toBe(3); 
      expect(currentList[2]).toEqual(newDash); // Appended
      expect(mockSnackBar.open).toHaveBeenCalledWith(expect.stringContaining('Cloned'), 'Close', expect.anything()); 
    }); 

    it('should handle clone failure', () => { 
      mockDashApi.cloneDashboardApiV1DashboardsDashboardIdClonePost.mockReturnValue( 
          throwError(() => new Error('Clone Fail')) 
      ); 

      component.cloneDashboard(mockDashboardList[0]); 

      expect(component.dashboards().length).toBe(2); 
      expect(mockSnackBar.open).toHaveBeenCalledWith(expect.stringContaining('Failed to clone'), 'Close', expect.anything()); 
    }); 
  }); 

  it('should open Ask AI from template button', () => {
    const buttons = fixture.debugElement.queryAll(By.css('button[mat-stroked-button]'));
    buttons[0].triggerEventHandler('click', null);
    expect(mockAskDataService.open).toHaveBeenCalled();
  });

  it('should render loading state and grid state', () => {
    component.isLoading.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-testid=\"loading-state\"]'))).toBeTruthy();

    component.isLoading.set(false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('[data-testid=\"dashboard-grid\"]'))).toBeTruthy();
  });

  it('should show restore spinner when restoring', () => {
    component.isRestoring.set(true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('mat-spinner'))).toBeTruthy();
  });

  it('should trigger create dialog and restore defaults from empty state', () => {
    const createSpy = vi.spyOn(component, 'openCreateDialog').mockImplementation(() => {});
    const restoreSpy = vi.spyOn(component, 'restoreDefaults').mockImplementation(() => {});
    component.isLoading.set(false);
    component.dashboards.set([]);
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('[data-testid=\"empty-state\"]'));
    expect(emptyState).toBeTruthy();
    const emptyButtons = emptyState.queryAll(By.css('button'));
    expect(emptyButtons.length).toBe(2);
    emptyButtons[0].triggerEventHandler('click', null);
    emptyButtons[1].triggerEventHandler('click', null);

    expect(restoreSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();
  });

  it('should wire card menu actions from template', () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut.mockReturnValue(of({}));
    mockDashApi.cloneDashboardApiV1DashboardsDashboardIdClonePost.mockReturnValue(of({ id: 'd3', name: 'Copy', owner_id: 'u1', widgets: [] }));
    mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete.mockReturnValue(of({}));
    const menuBtn = fixture.debugElement.query(By.css('[data-testid=\"btn-card-menu\"]'));
    const stopEvent = { stopPropagation: vi.fn() } as any;
    menuBtn.triggerEventHandler('click', stopEvent);
    expect(stopEvent.stopPropagation).toHaveBeenCalled();

    const trigger = menuBtn.injector.get(MatMenuTrigger);
    trigger.openMenu();
    fixture.detectChanges();

    const overlayEl = overlay.getContainerElement();
    const items = overlayEl.querySelectorAll('button[mat-menu-item]');
    (items[0] as HTMLElement).click();
    (items[1] as HTMLElement).click();
    (items[2] as HTMLElement).click();

    expect(mockDashApi.updateDashboardApiV1DashboardsDashboardIdPut).toHaveBeenCalled();
    expect(mockDashApi.cloneDashboardApiV1DashboardsDashboardIdClonePost).toHaveBeenCalled();
    expect(mockDashApi.deleteDashboardApiV1DashboardsDashboardIdDelete).toHaveBeenCalled();
  });
});
