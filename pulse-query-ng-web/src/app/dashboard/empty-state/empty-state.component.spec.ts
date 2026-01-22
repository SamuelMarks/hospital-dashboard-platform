/** 
 * @fileoverview Unit tests for EmptyStateComponent. 
 * Includes manual mocking of @material/material-color-utilities. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { EmptyStateComponent } from './empty-state.component'; 
import { DashboardStore } from '../dashboard.store'; 
import { AskDataService } from '../../global/ask-data.service'; 
import { MatDialog } from '@angular/material/dialog'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { signal } from '@angular/core'; 
import { By } from '@angular/platform-browser'; 
import { WidgetBuilderComponent } from '../widget-builder/widget-builder.component'; 
import { of } from 'rxjs'; 
import { vi } from 'vitest';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xFFFFFFFF,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true
}));

describe('EmptyStateComponent', () => { 
  let component: EmptyStateComponent; 
  let fixture: ComponentFixture<EmptyStateComponent>; 
  let mockStore: any; 
  let mockAskData: any; 
  let mockDialog: any; 

  beforeEach(async () => { 
    mockStore = { 
      dashboard: signal({ id: 'd1' }), 
      isLoading: signal(false), 
      isEditMode: signal(false), 
      toggleEditMode: vi.fn(), 
      createDefaultDashboard: vi.fn(), 
      loadDashboard: vi.fn() 
    }; 

    mockAskData = { 
      open: vi.fn() 
    }; 

    mockDialog = { 
      open: vi.fn().mockReturnValue({ 
        afterClosed: () => of(true) 
      }) 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [EmptyStateComponent, NoopAnimationsModule], 
      providers: [ 
        { provide: DashboardStore, useValue: mockStore }, 
        { provide: AskDataService, useValue: mockAskData }, 
        { provide: MatDialog, useValue: mockDialog } 
      ] 
    }).compileComponents(); 

    fixture = TestBed.createComponent(EmptyStateComponent); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should create', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should open wizard on template card click', () => { 
    // Find first card (Wizard) 
    const card = fixture.debugElement.queryAll(By.css('.action-card'))[0]; 
    card.triggerEventHandler('click', null); 

    expect(mockStore.toggleEditMode).toHaveBeenCalled(); // Should auto-enable edit
    expect(mockDialog.open).toHaveBeenCalledWith(WidgetBuilderComponent, expect.anything()); 
  }); 

  it('should open AI sidebar on AI card click', () => { 
    const card = fixture.debugElement.queryAll(By.css('.action-card'))[1]; 
    card.triggerEventHandler('click', null); 

    expect(mockAskData.open).toHaveBeenCalled(); 
  }); 

  it('should trigger seeder on sample card click', () => { 
    const card = fixture.debugElement.queryAll(By.css('.action-card'))[2]; 
    card.triggerEventHandler('click', null); 

    expect(mockStore.createDefaultDashboard).toHaveBeenCalled(); 
  }); 
});