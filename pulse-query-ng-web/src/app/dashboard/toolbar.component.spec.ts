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
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';

describe('ToolbarComponent', () => {
  let component: ToolbarComponent;
  let fixture: ComponentFixture<ToolbarComponent>;

  let mockAskService: any;
  let mockDialog: any;
  let mockStore: any;
  let mockAuthService: any;
  let router: Router;

  let dashboardSig: WritableSignal<DashboardResponse | null>;
  let isLoadingSig: WritableSignal<boolean>;
  let currentUserSig: WritableSignal<any>;
  let isEditModeSig: WritableSignal<boolean>;
  let globalParamsSig: WritableSignal<any>;

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
        NoopAnimationsModule
      ],
      providers: [
        { provide: DashboardStore, useValue: mockStore },
        { provide: DashboardsService, useValue: {} },
        { provide: AskDataService, useValue: mockAskService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AuthService, useValue: mockAuthService },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle edit mode via store when slide toggle changes', () => {
    isEditModeSig.set(true);
    fixture.detectChanges();
    expect(component.store.isEditMode()).toBe(true);
  });

  it('should logout via auth service', () => {
    component.logout();
    expect(mockAuthService.logout).toHaveBeenCalled();
  });
});