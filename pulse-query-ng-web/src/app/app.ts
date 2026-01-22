/** 
 * @fileoverview Root Application Component. 
 * 
 * Acts as the main Layout Shell for the application. 
 * - Wraps the content in a `mat-sidenav-container` to support global drawers. 
 * - **NEW**: Hosts the Global `ToolbarComponent` for consistent navigation and logout.
 * - Manages the "Ask Data" right-side drawer visibility. 
 * - **TV Mode**: Listens for `?mode=tv` to enable Kiosk state. 
 */ 

import { Component, inject, OnInit } from '@angular/core'; 
import { RouterOutlet, ActivatedRoute } from '@angular/router'; 
import { MatSidenavModule } from '@angular/material/sidenav'; 
import { AskDataComponent } from './global/ask-data.component'; 
import { AskDataService } from './global/ask-data.service'; 
import { ThemeService } from './core/theme/theme.service'; 
import { ToolbarComponent } from './dashboard/toolbar.component';

/** 
 * The Root Component class. 
 * 
 * **Accessibility Note:** 
 * The `mat-sidenav` serves as a complementary region to the main content. 
 * It is labeled "Ask Data Assistant" to provide context to screen readers. 
 * 
 * **Layout:**
 * Uses a flex-column layout in `mat-sidenav-content` to position the Toolbar
 * at the top and the RouterOutlet filling the remaining space using `flex-grow`.
 * 
 * @class
 */ 
@Component({ 
  selector: 'app-root', 
  imports: [ 
    RouterOutlet, 
    MatSidenavModule, 
    AskDataComponent,
    ToolbarComponent
  ], 
  template: `
    <mat-sidenav-container class="h-full-container" autosize>
      
      <!-- Side Drawer (Right aligned) -->
      <mat-sidenav 
        #sidenav
        mode="over" 
        position="end" 
        [opened]="askData.isOpen()" 
        (closed)="askData.close()" 
        aria-label="Ask Data Assistant" 
        class="search-drawer" 
      >
        <!-- The Content of the Sidebar -->
        <app-ask-data></app-ask-data>
      </mat-sidenav>

      <!-- Main Content Area -->
      <mat-sidenav-content role="main" class="main-content-layout">
        
        <!-- Global Toolbar (Hidden in TV Mode) -->
        @if (!themeService.isTvMode()) {
          <app-toolbar class="global-toolbar"></app-toolbar>
        }

        <!-- Page Content -->
        <div class="page-container">
          <router-outlet></router-outlet>
        </div>

      </mat-sidenav-content>

    </mat-sidenav-container>
  `, 
  styles: [`
    :host { 
      display: block; 
      height: 100vh; 
      overflow: hidden; 
    } 
    /* Container fills viewport and adapts to theme background */ 
    .h-full-container { 
      height: 100%; 
      background-color: var(--sys-background); 
      color: var(--sys-text-primary); 
    } 
    /* Flex layout for Toolbar + Content */
    .main-content-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }
    .global-toolbar {
      flex-shrink: 0;
      z-index: 1000;
    }
    .page-container {
      flex-grow: 1;
      overflow: hidden;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    /* Drawer styling with border for high contrast separation */ 
    .search-drawer { 
      width: 90vw; 
      max-width: 600px; 
      border-left: 1px solid var(--sys-surface-border); 
      background-color: var(--sys-surface); 
    } 
  `] 
}) 
export class App implements OnInit { 
  /** 
   * Service controlling the visibility state of the side drawer. 
   * Bound to the `[opened]` property of the sidenav. 
   * 
   * @readonly
   */ 
  readonly askData = inject(AskDataService); 
  readonly themeService = inject(ThemeService); 
  private readonly route = inject(ActivatedRoute); 

  ngOnInit(): void { 
    // Global listener for Kiosk Mode parameter
    this.route.queryParams.subscribe(params => { 
      if (params['mode'] === 'tv') { 
        this.themeService.setTvMode(true); 
      } 
    }); 
  } 
}