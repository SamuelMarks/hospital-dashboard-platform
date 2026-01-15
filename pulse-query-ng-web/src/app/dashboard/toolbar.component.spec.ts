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
import { WidgetCreationDialog } from './widget-creation.dialog';
import { RouterTestingModule } from '@angular/router/testing';

describe('ToolbarComponent', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;
  
  let mockAskService: any;
  let mockDialog: any;
  let mockStore: any;
  let mockAuthService: any;
  
  let dashboardSig: WritableSignal<DashboardResponse | null>;
  let isLoadingSig: WritableSignal<boolean>;
  let currentUserSig: WritableSignal<any>;

  const mockDashboard: DashboardResponse = { 
    id: 'd1', name: 'Sales Dash', owner_id: 'u1', widgets: [] 
  };

  beforeEach(async () => {
    dashboardSig = signal(null);
    isLoadingSig = signal(false);
    currentUserSig = signal({ email: 'tester@pulse.com', id: 'u1' });

    mockAskService = { open: vi.fn() };
    mockDialog = { open: vi.fn() };
    
    mockStore = {
      dashboard: dashboardSig,
      isLoading: isLoadingSig,
      refreshAll: vi.fn(),
      loadDashboard: vi.fn(),
      updateGlobalParam: vi.fn()
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
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display dashboard name from store', () => {
    dashboardSig.set(mockDashboard);
    fixture.detectChanges();
    
    const titleEl = fixture.debugElement.query(By.css('.title-main'));
    expect(titleEl.nativeElement.textContent).toContain('Sales Dash');
  });

  describe('User Menu Interactions', () => {
    it('should generate correct initials for avatar', () => {
      expect(component.userInitials()).toBe('TE');
      
      currentUserSig.set({ email: 'admin@test.com' });
      fixture.detectChanges();
      
      expect(component.userInitials()).toBe('AD');
    });

    it('should call authService.logout() when logout action clicked', () => {
      component.logout();
      expect(mockAuthService.logout).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label for theme toggle', () => {
      const btn = fixture.debugElement.query(By.css('button[mat-icon-button]')); // First button is theme
      expect(btn.attributes['aria-label']).toContain('Mode'); 
    });
  });

  describe('Widget Actions', () => {
    it('should open WidgetCreationDialog when Add Widget button is clicked', () => {
      dashboardSig.set(mockDashboard);
      fixture.detectChanges();

      const dialogRefSpy = { afterClosed: () => of(true) };
      mockDialog.open.mockReturnValue(dialogRefSpy);

      // We need to find button by text content or icon since we didn't use test-id for all
      // Assuming 3rd button is templates, 4th is Add
      // Better to check specific call after method invocation for unit test stability
      
      component.openAddWidgetDialog();
      
      expect(mockDialog.open).toHaveBeenCalledWith(
        WidgetCreationDialog,
        expect.objectContaining({
          data: { dashboardId: 'd1' }
        })
      );

      expect(mockStore.loadDashboard).toHaveBeenCalledWith('d1');
    });
  });
});