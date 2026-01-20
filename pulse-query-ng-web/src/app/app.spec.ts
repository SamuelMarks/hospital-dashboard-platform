/** 
 * @fileoverview Unit tests for the App Root Component. 
 * Verifies layout structure, dependency injection, and interaction with the Sidebar service. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { Component, signal, WritableSignal } from '@angular/core'; 
import { RouterOutlet, provideRouter } from '@angular/router'; 
import { By } from '@angular/platform-browser'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { App } from './app'; 
import { AskDataComponent } from './global/ask-data.component'; 
import { AskDataService } from './global/ask-data.service'; 

/** 
 * Mock Child Component to avoid rendering the heavy AskData logic during root tests. 
 */ 
@Component({ 
  selector: 'app-ask-data', 
  template: '<div data-testid="mock-ask-data"></div>' 
}) 
class MockAskDataComponent {} 

describe('App', () => { 
  let fixture: ComponentFixture<App>; 
  let component: App; 
  
  // Mock Service Configuration
  let mockAskDataService: { 
    isOpen: WritableSignal<boolean>; 
    close: ReturnType<typeof vi.fn>; 
  }; 

  beforeEach(async () => { 
    // Initialize mock signal for state testing
    mockAskDataService = { 
      isOpen: signal(false), 
      close: vi.fn() 
    }; 

    await TestBed.configureTestingModule({ 
      imports: [App, NoopAnimationsModule], 
      providers: [ 
        { provide: AskDataService, useValue: mockAskDataService },
        // Provide Router to satisfy ActivatedRoute dependency in App component
        provideRouter([]) 
      ] 
    }) 
      .overrideComponent(App, { 
        remove: { imports: [AskDataComponent] }, 
        add: { imports: [MockAskDataComponent] } 
      }) 
      .compileComponents(); 

    fixture = TestBed.createComponent(App); 
    component = fixture.componentInstance; 
    fixture.detectChanges(); 
  }); 

  it('should create the app component', () => { 
    expect(component).toBeTruthy(); 
  }); 

  it('should contain a mat-sidenav-container with correct styles', () => { 
    const container = fixture.debugElement.query(By.css('mat-sidenav-container')); 
    expect(container).toBeTruthy(); 
    expect(container.classes['h-full-container']).toBe(true); 
  }); 

  it('should have an accessible mat-sidenav', () => { 
    const sidenav = fixture.debugElement.query(By.css('mat-sidenav')); 
    expect(sidenav).toBeTruthy(); 
    // Check for A11y label
    expect(sidenav.attributes['aria-label']).toBe('Ask Data Assistant'); 
  }); 

  it('should respond to service signal changes', () => { 
    const sidenavElement = fixture.debugElement.query(By.css('mat-sidenav')); 
    
    // Initial State: Closed
    expect(component.askData.isOpen()).toBe(false); 
    expect(sidenavElement.componentInstance.opened).toBe(false); 

    // Update Signal: Open
    mockAskDataService.isOpen.set(true); 
    fixture.detectChanges(); 

    expect(sidenavElement.componentInstance.opened).toBe(true); 
  }); 

  it('should call service.close() when sidenav emits closed event', () => { 
    const sidenav = fixture.debugElement.query(By.css('mat-sidenav')); 
    
    // Simulate the close event (e.g. clicking backdrop) 
    sidenav.triggerEventHandler('closed', {}); 
    
    expect(mockAskDataService.close).toHaveBeenCalled(); 
  }); 

  it('should contain router-outlet inside main content area', () => { 
    const content = fixture.debugElement.query(By.css('mat-sidenav-content')); 
    expect(content.attributes['role']).toBe('main'); 
    
    const outlet = content.query(By.directive(RouterOutlet)); 
    expect(outlet).toBeTruthy(); 
  }); 

  it('should render the AskData component inside the drawer', () => { 
    const sidenav = fixture.debugElement.query(By.css('mat-sidenav')); 
    // Ensure content (even if projected) is queried correctly
    const askData = sidenav.query(By.directive(MockAskDataComponent)); 
    expect(askData).toBeTruthy(); 
  }); 
});