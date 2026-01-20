/** 
 * @fileoverview Unit tests for Dashboard Layout. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { DashboardLayoutComponent } from './dashboard-layout.component'; 
import { DashboardStore } from './dashboard.store'; 
import { DashboardsService, WidgetResponse, DashboardResponse } from '../api-client'; 
import { ActivatedRoute } from '@angular/router'; 
import { of, BehaviorSubject } from 'rxjs'; 
import { signal, WritableSignal, Component, input, output } from '@angular/core'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { MatDialog } from '@angular/material/dialog'; 
import { MatSnackBar } from '@angular/material/snack-bar'; 
import { WidgetComponent } from '../widget/widget.component'; 
import { DragDropModule } from '@angular/cdk/drag-drop'; 
import { SkeletonLoaderComponent } from '../shared/components/skeleton-loader.component'; 
import { By } from '@angular/platform-browser'; 
import { ProvisioningService } from './provisioning.service'; // Added Dependency

@Component({ selector: 'app-widget', template: '' }) 
class MockWidgetComponent { 
  widget = input<WidgetResponse>(); 
  edit = output<void>(); 
  delete = output<void>(); 
  duplicate = output<void>(); 
} 

// Mock Empty State for component test usage
@Component({ selector: 'app-empty-state', template: '' }) 
class MockEmptyStateComponent {}

describe('DashboardLayoutComponent', () => { 
  let component: DashboardLayoutComponent; 
  let fixture: ComponentFixture<DashboardLayoutComponent>; 
  let mockStore: any; 
  
  let isLoadingSig: WritableSignal<boolean>; 
  let dashboardSig: WritableSignal<DashboardResponse | null>; 
  let isEditModeSig: WritableSignal<boolean>; 
  let focusedWidgetSig: WritableSignal<WidgetResponse | null>; 
  let globalParamsSig: WritableSignal<any>; 

  let paramMapSub: BehaviorSubject<any>; 
  let queryParamMapSub: BehaviorSubject<any>; 

  let mockProvisioning: any; 

  beforeEach(async () => { 
    isLoadingSig = signal(false); 
    dashboardSig = signal(null); 
    isEditModeSig = signal(false); 
    focusedWidgetSig = signal(null); 
    globalParamsSig = signal({}); 

    mockStore = { 
      isLoading: isLoadingSig, 
      error: signal(null), 
      dashboard: dashboardSig, 
      widgets: signal([]), 
      focusedWidget: focusedWidgetSig, 
      isEditMode: isEditModeSig, 
      sortedWidgets: signal([]), // Added required selector
      globalParams: globalParamsSig, // Used in Toolbar
      lastUpdated: signal(new Date()), 
      loadDashboard: vi.fn(), 
      reset: vi.fn(), 
      handleWidgetDrop: vi.fn(), 
      optimisticRemoveWidget: vi.fn(), 
      optimisticRestoreWidget: vi.fn(), 
      setFocusedWidget: vi.fn(), 
      setGlobalParams: vi.fn(), 
      duplicateWidget: vi.fn() 
    }; 

    mockProvisioning = { 
      provisionWidget: vi.fn().mockReturnValue(of({})) 
    }; 

    paramMapSub = new BehaviorSubject({ get: () => 'd1' }); 
    queryParamMapSub = new BehaviorSubject({ keys: [], get: () => null }); 

    await TestBed.configureTestingModule({ 
      imports: [DashboardLayoutComponent, NoopAnimationsModule, DragDropModule], 
      providers: [ 
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: DashboardsService, useValue: { deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn() } }, 
        { provide: MatSnackBar, useValue: { open: vi.fn() } }, 
        { provide: MatDialog, useValue: { open: vi.fn() } }, 
        { provide: ProvisioningService, useValue: mockProvisioning }, 
        { 
            provide: ActivatedRoute, 
            useValue: { 
                paramMap: paramMapSub.asObservable(), 
                queryParamMap: queryParamMapSub.asObservable() 
            } 
        } 
      ] 
    }) 
    .overrideComponent(DashboardLayoutComponent, { 
       remove: { imports: [WidgetComponent] }, 
       add: { imports: [MockWidgetComponent, MockEmptyStateComponent] } 
    }).compileComponents(); 

    fixture = TestBed.createComponent(DashboardLayoutComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should sync query parameters to store global params', () => { 
    // Simulate query param change
    queryParamMapSub.next({ 
        keys: ['dept', 'view'], 
        get: (k: string) => k === 'dept' ? 'Cardiology' : 'Full' 
    }); 
    
    expect(mockStore.setGlobalParams).toHaveBeenCalledWith({ dept: 'Cardiology', view: 'Full' }); 
  }); 

  it('should reload dashboard on ID change', () => { 
    paramMapSub.next({ get: () => 'd2' }); 
    expect(mockStore.reset).toHaveBeenCalled(); 
    expect(mockStore.loadDashboard).toHaveBeenCalledWith('d2'); 
  }); 
});