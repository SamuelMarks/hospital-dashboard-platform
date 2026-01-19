/** 
 * @fileoverview Unit tests for Toolbar Component. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { ToolbarComponent } from './toolbar.component'; 
import { DashboardStore } from './dashboard.store'; 
import { AskDataService } from '../global/ask-data.service'; 
import { AuthService } from '../core/auth/auth.service'; 
import { DashboardsService, DashboardResponse } from '../api-client'; 
import { MatDialog } from '@angular/material/dialog'; 
import { signal, WritableSignal } from '@angular/core'; 
import { of } from 'rxjs'; 
import { By } from '@angular/platform-browser'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { WidgetBuilderComponent } from './widget-builder/widget-builder.component'; 
import { RouterTestingModule } from '@angular/router/testing'; 
import { Router, ActivatedRoute } from '@angular/router'; 

describe('ToolbarComponent', () => { 
  let component: ToolbarComponent; 
  let fixture: ComponentFixture<ToolbarComponent>; 
  
  let mockAskService: any; 
  let mockDialog: any; 
  let mockStore: any; 
  let mockAuthService: any; 
  let router: Router; 
  let route: ActivatedRoute; 
  
  let dashboardSig: WritableSignal<DashboardResponse | null>; 
  let isLoadingSig: WritableSignal<boolean>; 
  let currentUserSig: WritableSignal<any>; 
  let isEditModeSig: WritableSignal<boolean>; 
  let globalParamsSig: WritableSignal<any>; 

  const mockDashboard: DashboardResponse = { 
    id: 'd1', name: 'Sales Dash', owner_id: 'u1', widgets: [] 
  }; 

  beforeEach(async () => { 
    dashboardSig = signal(null); 
    isLoadingSig = signal(false); 
    isEditModeSig = signal(false); 
    currentUserSig = signal({ email: 'tester@pulse.com', id: 'u1' }); 
    globalParamsSig = signal({}); 

    mockAskService = { open: vi.fn() }; 
    mockDialog = { open: vi.fn() }; 
    
    // Minimal mock covering usage
    mockStore = { 
      dashboard: dashboardSig, 
      isLoading: isLoadingSig, 
      isEditMode: isEditModeSig, 
      globalParams: globalParamsSig, 
      refreshAll: vi.fn(), 
      loadDashboard: vi.fn(), 
      toggleEditMode: vi.fn() 
    }; 

    mockAuthService = { 
      currentUser: currentUserSig, 
      logout: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [ 
        ToolbarComponent, 
        NoopAnimationsModule, 
        RouterTestingModule
      ], 
      providers: [ 
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: DashboardsService, useValue: {} }, 
        { provide: AskDataService, useValue: mockAskService }, 
        { provide: MatDialog, useValue: mockDialog }, 
        { provide: AuthService, useValue: mockAuthService } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(ToolbarComponent); 
    component = fixture.componentInstance; 
    
    router = TestBed.inject(Router); 
    route = TestBed.inject(ActivatedRoute); 
    vi.spyOn(router, 'navigate').mockResolvedValue(true); 

    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should update filter by navigating router', () => { 
    component.updateFilter('dept', 'Cardiology'); 
    
    expect(router.navigate).toHaveBeenCalledWith([], { 
        relativeTo: route, 
        queryParams: { dept: 'Cardiology' }, 
        queryParamsHandling: 'merge' 
    }); 
  }); 

  it('should remove filter if value is null', () => { 
    component.updateFilter('dept', null); 
    
    expect(router.navigate).toHaveBeenCalledWith([], { 
        relativeTo: route, 
        queryParams: { dept: null }, 
        queryParamsHandling: 'merge' 
    }); 
  }); 
});