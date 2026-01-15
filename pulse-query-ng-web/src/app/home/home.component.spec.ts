import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { HomeComponent } from './home.component'; 
import { DashboardsService, DashboardResponse } from '../api-client'; 
import { provideRouter } from '@angular/router'; 
import { MatDialog } from '@angular/material/dialog'; 
import { MatMenuModule } from '@angular/material/menu'; 
import { MatSnackBar } from '@angular/material/snack-bar'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { of, throwError } from 'rxjs'; 

describe('HomeComponent', () => { 
  let component: HomeComponent; 
  let fixture: ComponentFixture<HomeComponent>; 
  
  let mockDashApi: any; 
  let mockDialog: any; 
  let mockSnackBar: any; 

  const mockDashboardList: DashboardResponse[] = [ 
    { id: 'd1', name: 'Finance', owner_id: 'u1', widgets: [] }, 
    { id: 'd2', name: 'Operations', owner_id: 'u1', widgets: [] } 
  ]; 

  beforeEach(async () => { 
    mockDashApi = { 
      listDashboardsApiV1DashboardsGet: vi.fn(), 
      updateDashboardApiV1DashboardsDashboardIdPut: vi.fn(), 
      deleteDashboardApiV1DashboardsDashboardIdDelete: vi.fn() 
    }; 
    mockDialog = { open: vi.fn() }; 
    
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
        // 1. Provide at Module Level
        { provide: MatSnackBar, useValue: mockSnackBar } 
      ] 
    }) 
    // 2. Force override at Component Level to ensure the standalone component 
    // uses our mock instead of the one provided by MatSnackBarModule import
    .overrideComponent(HomeComponent, { 
      set: { 
        providers: [ 
          { provide: MatSnackBar, useValue: mockSnackBar } 
        ] 
      } 
    }) 
    .compileComponents(); 

    fixture = TestBed.createComponent(HomeComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  afterEach(() => { 
    vi.restoreAllMocks(); 
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
});