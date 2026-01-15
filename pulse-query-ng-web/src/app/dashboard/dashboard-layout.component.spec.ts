/** 
 * @fileoverview Unit tests for Dashboard Layout. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { DashboardLayoutComponent } from './dashboard-layout.component'; 
import { DashboardStore } from './dashboard.store'; 
import { DashboardsService, WidgetResponse, DashboardResponse } from '../api-client'; 
import { ActivatedRoute } from '@angular/router'; 
import { of } from 'rxjs'; 
import { signal, WritableSignal, Component, input, output } from '@angular/core'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { MatDialog } from '@angular/material/dialog'; 
import { MatSnackBar } from '@angular/material/snack-bar'; 
import { WidgetComponent } from '../widget/widget.component'; 
import { DragDropModule } from '@angular/cdk/drag-drop'; 
import { SkeletonLoaderComponent } from '../shared/components/skeleton-loader.component'; 
import { By } from '@angular/platform-browser'; 

@Component({ selector: 'app-widget', template: '' }) 
class MockWidgetComponent { 
  widget = input<WidgetResponse>(); 
  edit = output<void>(); 
  delete = output<void>(); 
} 

describe('DashboardLayoutComponent', () => { 
  let component: DashboardLayoutComponent; 
  let fixture: ComponentFixture<DashboardLayoutComponent>; 
  let mockStore: any; 
  
  let isLoadingSig: WritableSignal<boolean>; 
  let dashboardSig: WritableSignal<DashboardResponse | null>; 

  beforeEach(async () => { 
    isLoadingSig = signal(false); 
    dashboardSig = signal(null); 

    mockStore = { 
      isLoading: isLoadingSig, 
      error: signal(null), 
      dashboard: dashboardSig, 
      widgets: signal([]), 
      loadDashboard: vi.fn(), 
      reset: vi.fn(), 
      handleWidgetDrop: vi.fn(), // Mocking the new store signature
      optimisticRemoveWidget: vi.fn(), 
      optimisticRestoreWidget: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [DashboardLayoutComponent, NoopAnimationsModule, DragDropModule], 
      providers: [ 
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: DashboardsService, useValue: { deleteWidgetApiV1DashboardsWidgetsWidgetIdDelete: vi.fn() } }, 
        { provide: MatSnackBar, useValue: { open: vi.fn() } }, 
        { provide: MatDialog, useValue: { open: vi.fn() } }, 
        { provide: ActivatedRoute, useValue: { paramMap: of({ get: () => 'd1' }) } } 
      ] 
    }) 
    .overrideComponent(DashboardLayoutComponent, { 
       remove: { imports: [WidgetComponent] }, 
       add: { imports: [MockWidgetComponent] } 
    }).compileComponents(); 

    fixture = TestBed.createComponent(DashboardLayoutComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should show skeleton grid when loading dashboard', () => { 
    isLoadingSig.set(true); 
    dashboardSig.set(null); 
    fixture.detectChanges(); 

    const skeletonGrid = fixture.debugElement.query(By.css('[data-testid="skeleton-grid"]')); 
    expect(skeletonGrid).toBeTruthy(); 

    const loaders = fixture.debugElement.queryAll(By.directive(SkeletonLoaderComponent)); 
    expect(loaders.length).toBe(4); 
  }); 

  it('should hide skeleton when dashboard loaded', () => { 
    isLoadingSig.set(false); 
    dashboardSig.set({ id: 'd1', name: 'Real', owner_id: 'u1', widgets: [] }); 
    fixture.detectChanges(); 

    const skeletonGrid = fixture.debugElement.query(By.css('[data-testid="skeleton-grid"]')); 
    expect(skeletonGrid).toBeFalsy(); 
  }); 

  it('should delegate drop events to store', () => { 
    // Setup lanes data
    // Fix: Use double cast to unknown then WidgetResponse to bypass type overlap mismatch on mock object
    const w1 = { id: 'w1', config: { group: 'A' } } as unknown as WidgetResponse; 
    mockStore.widgets.set([w1]); 
    fixture.detectChanges(); 

    const dropEvent = { 
        previousContainer: { data: [w1] }, 
        container: { data: [] }, // Moved out
        previousIndex: 0, 
        currentIndex: 0
    } as any; 

    component.dragDropped(dropEvent, 'B'); 

    expect(mockStore.handleWidgetDrop).toHaveBeenCalledWith( 
        false, // sameContainer
        'B',   // targetGroupId
        0,     // prevIndex
        0,     // currIndex
        [],    // containerData
        [w1]   // prevContainerData
    ); 
  }); 
});