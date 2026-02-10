/** 
 * @fileoverview Unit tests for the App Root Component. 
 * Includes manual mocking of @material/material-color-utilities. 
 */ 

import { ComponentFixture, TestBed } from '@angular/core/testing'; 
import { Component, signal, WritableSignal } from '@angular/core'; 
import { RouterOutlet, provideRouter, ActivatedRoute } from '@angular/router'; 
import { By } from '@angular/platform-browser'; 
import { NoopAnimationsModule } from '@angular/platform-browser/animations'; 
import { type App as AppType } from './app'; 
import { type AskDataComponent as AskDataComponentType } from './global/ask-data.component'; 
import { AskDataService } from './global/ask-data.service'; 
import { type ThemeService as ThemeServiceType } from './core/theme/theme.service';
import { type ToolbarComponent as ToolbarComponentType } from './dashboard/toolbar.component';
import { vi } from 'vitest';
import { Subject } from 'rxjs';

// MOCK: @material/material-color-utilities
vi.mock('@material/material-color-utilities', () => ({
  argbFromHex: () => 0xFFFFFFFF,
  hexFromArgb: () => '#ffffff',
  themeFromSourceColor: () => ({ schemes: { light: {}, dark: {} } }),
  Scheme: class {},
  Theme: class {},
  __esModule: true
}));

/** 
 * Mock Child Component to avoid rendering the heavy AskData logic during root tests. 
 */ 
@Component({ 
  selector: 'app-ask-data', 
  template: '<div data-testid="mock-ask-data"></div>' 
}) 
class MockAskDataComponent {} 

@Component({
  selector: 'app-toolbar',
  template: '<div data-testid="mock-toolbar"></div>'
})
class MockToolbarComponent {}

describe('App', () => { 
  let fixture: ComponentFixture<AppType>; 
  let component: AppType; 
  let AppCtor: typeof import('./app').App;
  let AskDataComponentCtor: typeof import('./global/ask-data.component').AskDataComponent;
  let ToolbarComponentCtor: typeof import('./dashboard/toolbar.component').ToolbarComponent;
  let ThemeServiceCtor: typeof import('./core/theme/theme.service').ThemeService;
  let queryParams$: Subject<Record<string, any>>;
  let mockThemeService: { isTvMode: ReturnType<typeof signal>; setTvMode: ReturnType<typeof vi.fn> };
  
  // Mock Service Configuration
  let mockAskDataService: { 
    isOpen: WritableSignal<boolean>; 
    close: ReturnType<typeof vi.fn>; 
  }; 

  beforeEach(async () => { 
    const [appMod, askDataMod, toolbarMod, themeMod] = await Promise.all([
      import('./app'),
      import('./global/ask-data.component'),
      import('./dashboard/toolbar.component'),
      import('./core/theme/theme.service')
    ]);

    AppCtor = appMod.App;
    AskDataComponentCtor = askDataMod.AskDataComponent;
    ToolbarComponentCtor = toolbarMod.ToolbarComponent;
    ThemeServiceCtor = themeMod.ThemeService;

    // Initialize mock signal for state testing
    mockAskDataService = { 
      isOpen: signal(false), 
      close: vi.fn() 
    }; 
    queryParams$ = new Subject<Record<string, any>>();
    mockThemeService = {
      isTvMode: signal(false),
      setTvMode: vi.fn()
    };

    await TestBed.configureTestingModule({ 
      imports: [AppCtor, NoopAnimationsModule], 
      providers: [ 
        { provide: AskDataService, useValue: mockAskDataService }, 
        { provide: ThemeServiceCtor, useValue: mockThemeService },
        // Provide Router to satisfy ActivatedRoute dependency in App component
        provideRouter([]) 
      ] 
    }) 
      .overrideComponent(AppCtor, { 
        remove: { imports: [AskDataComponentCtor, ToolbarComponentCtor] }, 
        add: { imports: [MockAskDataComponent, MockToolbarComponent] } 
      }) 
      .compileComponents(); 

    TestBed.overrideProvider(ActivatedRoute, { useValue: { queryParams: queryParams$.asObservable() } });

    fixture = TestBed.createComponent(AppCtor); 
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

  it('should enable TV mode when query param mode=tv', () => {
    queryParams$.next({ mode: 'tv' });
    fixture.detectChanges();
    expect(mockThemeService.setTvMode).toHaveBeenCalledWith(true);
  });

  it('should ignore non-tv mode query params', () => {
    queryParams$.next({ mode: 'desktop' });
    fixture.detectChanges();
    expect(mockThemeService.setTvMode).not.toHaveBeenCalled();
  });
}); 
